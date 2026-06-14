use std::collections::HashMap;

use aws_sdk_dynamodb::types::{AttributeValue, ReturnValue};
use axum::{
    extract::{Host, Path, State},
    http::HeaderMap,
    response::Json,
    routing::{get, post},
    Router,
};
use lambda_http::{http::StatusCode, run, tracing, Error};
use serde::{Deserialize, Serialize};
use stripe::{
    CheckoutSession, CheckoutSessionId, CheckoutSessionMode, CheckoutSessionPaymentStatus,
    Client as StripeClient,
    CreateCheckoutSession, CreateCheckoutSessionLineItems, CreateCheckoutSessionLineItemsPriceData,
    CreateCheckoutSessionLineItemsPriceDataProductData, CreateCheckoutSessionPaymentMethodTypes,
    Currency, EventObject, EventType, Webhook,
};

// Item id 0 is the atomic counter that hands out sequential post ids. It
// never carries post fields, so item_to_post naturally excludes it from reads.
const COUNTER_ID: i64 = 0;

#[derive(Serialize)]
struct Post {
    id: i64,
    title: String,
    content: String,
    published: bool,
}

#[derive(Deserialize)]
struct NewPost {
    title: String,
    content: String,
    published: bool,
}

#[derive(Deserialize)]
struct NewCheckout {
    amount_cents: i64,
    description: String,
}

#[derive(Serialize)]
struct CheckoutCreated {
    session_id: String,
    url: String,
}

#[derive(Serialize)]
struct Payment {
    event_id: String,
    session_id: String,
    amount_total: i64,
    currency: String,
    created: i64,
}

type ServerError = (StatusCode, String);

fn env_nonempty(key: &str) -> Option<String> {
    std::env::var(key).ok().filter(|value| !value.is_empty())
}

#[derive(Clone)]
struct Db {
    client: aws_sdk_dynamodb::Client,
    table: String,
    payments_table: String,
    // None until the Stripe secrets are configured; payment routes 503 cleanly
    stripe: Option<StripeClient>,
    webhook_secret: Option<String>,
    // origin of the SPA (e.g. http://localhost:5173); checkout redirect URLs
    // point here, falling back to the request host when unset
    web_origin: Option<String>,
}

impl Db {
    async fn new() -> Self {
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        Self {
            client: aws_sdk_dynamodb::Client::new(&config),
            table: env_nonempty("DB_TABLE").unwrap_or_else(|| "accept-payments-posts".to_string()),
            payments_table: env_nonempty("PAYMENTS_TABLE")
                .unwrap_or_else(|| "accept-payments-payments".to_string()),
            stripe: env_nonempty("STRIPE_SECRET_KEY").map(StripeClient::new),
            webhook_secret: env_nonempty("STRIPE_WEBHOOK_SECRET"),
            web_origin: env_nonempty("WEB_ORIGIN"),
        }
    }

    async fn next_id(&self) -> Result<i64, ServerError> {
        let counter = self
            .client
            .update_item()
            .table_name(&self.table)
            .key("id", AttributeValue::N(COUNTER_ID.to_string()))
            .update_expression("ADD next_id :one")
            .expression_attribute_values(":one", AttributeValue::N("1".to_string()))
            .return_values(ReturnValue::UpdatedNew)
            .send()
            .await
            .map_err(internal_server_error)?;

        counter
            .attributes()
            .and_then(|attrs| attrs.get("next_id"))
            .and_then(|value| value.as_n().ok())
            .and_then(|n| n.parse().ok())
            .ok_or((
                StatusCode::INTERNAL_SERVER_ERROR,
                "counter returned no value".to_string(),
            ))
    }

    async fn record_payment(
        &self,
        event_id: &str,
        session: &CheckoutSession,
    ) -> Result<(), ServerError> {
        let currency = session
            .currency
            .map(|currency| currency.to_string())
            .unwrap_or_else(|| "usd".to_string());

        let result = self
            .client
            .put_item()
            .table_name(&self.payments_table)
            .item("event_id", AttributeValue::S(event_id.to_string()))
            .item("session_id", AttributeValue::S(session.id.to_string()))
            .item(
                "amount_total",
                AttributeValue::N(session.amount_total.unwrap_or(0).to_string()),
            )
            .item("currency", AttributeValue::S(currency))
            .item("created", AttributeValue::N(session.created.to_string()))
            // webhook deliveries retry; the event id makes replays a no-op
            .condition_expression("attribute_not_exists(event_id)")
            .send()
            .await;

        match result {
            Ok(_) => Ok(()),
            Err(err)
                if err
                    .as_service_error()
                    .is_some_and(|err| err.is_conditional_check_failed_exception()) =>
            {
                Ok(())
            }
            Err(err) => Err(internal_server_error(err)),
        }
    }
}

fn item_to_post(item: &HashMap<String, AttributeValue>) -> Option<Post> {
    Some(Post {
        id: item.get("id")?.as_n().ok()?.parse().ok()?,
        title: item.get("title")?.as_s().ok()?.clone(),
        content: item.get("content")?.as_s().ok()?.clone(),
        published: *item.get("published")?.as_bool().ok()?,
    })
}

async fn create_post(
    State(db): State<Db>,
    Json(post): Json<NewPost>,
) -> Result<Json<Post>, ServerError> {
    let post = Post {
        id: db.next_id().await?,
        title: post.title,
        content: post.content,
        published: post.published,
    };

    db.client
        .put_item()
        .table_name(&db.table)
        .item("id", AttributeValue::N(post.id.to_string()))
        .item("title", AttributeValue::S(post.title.clone()))
        .item("content", AttributeValue::S(post.content.clone()))
        .item("published", AttributeValue::Bool(post.published))
        .send()
        .await
        .map_err(internal_server_error)?;

    Ok(Json(post))
}

async fn list_posts(State(db): State<Db>) -> Result<Json<Vec<Post>>, ServerError> {
    let mut posts = Vec::new();
    let mut start_key = None;

    loop {
        let page = db
            .client
            .scan()
            .table_name(&db.table)
            // "published" must go through a name alias in case it ever lands
            // on DynamoDB's reserved word list
            .filter_expression("#p = :true")
            .expression_attribute_names("#p", "published")
            .expression_attribute_values(":true", AttributeValue::Bool(true))
            .set_exclusive_start_key(start_key)
            .send()
            .await
            .map_err(internal_server_error)?;

        posts.extend(page.items().iter().filter_map(item_to_post));

        start_key = page.last_evaluated_key().map(|key| key.clone());
        if start_key.is_none() {
            break;
        }
    }

    // Scan returns items in hash order; keep the old insertion-order behavior
    posts.sort_by_key(|post| post.id);
    Ok(Json(posts))
}

async fn get_post(
    State(db): State<Db>,
    Path(post_id): Path<i64>,
) -> Result<Json<Post>, ServerError> {
    let item = db
        .client
        .get_item()
        .table_name(&db.table)
        .key("id", AttributeValue::N(post_id.to_string()))
        .send()
        .await
        .map_err(internal_server_error)?;

    item.item()
        .and_then(item_to_post)
        .map(Json)
        .ok_or((StatusCode::NOT_FOUND, format!("no post with id {post_id}")))
}

async fn delete_post(State(db): State<Db>, Path(post_id): Path<i64>) -> Result<(), ServerError> {
    // deleting the counter would restart id assignment and collide with
    // existing posts
    if post_id == COUNTER_ID {
        return Err((StatusCode::NOT_FOUND, format!("no post with id {post_id}")));
    }

    db.client
        .delete_item()
        .table_name(&db.table)
        .key("id", AttributeValue::N(post_id.to_string()))
        .send()
        .await
        .map_err(internal_server_error)?;

    Ok(())
}

fn item_to_payment(item: &HashMap<String, AttributeValue>) -> Option<Payment> {
    Some(Payment {
        event_id: item.get("event_id")?.as_s().ok()?.clone(),
        session_id: item.get("session_id")?.as_s().ok()?.clone(),
        amount_total: item.get("amount_total")?.as_n().ok()?.parse().ok()?,
        currency: item.get("currency")?.as_s().ok()?.clone(),
        created: item.get("created")?.as_n().ok()?.parse().ok()?,
    })
}

async fn create_checkout(
    State(db): State<Db>,
    Host(host): Host,
    Json(checkout): Json<NewCheckout>,
) -> Result<Json<CheckoutCreated>, ServerError> {
    let stripe = db.stripe.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "payments are not configured".to_string(),
    ))?;

    // Stripe's minimum charge is $0.50; cap keeps test-mode fat fingers sane
    if !(50..=1_000_000).contains(&checkout.amount_cents) {
        return Err((
            StatusCode::BAD_REQUEST,
            "amount_cents must be between 50 and 1000000".to_string(),
        ));
    }

    // the SPA renders the receipt; fall back to the request host if unconfigured
    let web_origin = db
        .web_origin
        .clone()
        .unwrap_or_else(|| format!("https://{host}"));
    let success_url = format!("{web_origin}/success?session_id={{CHECKOUT_SESSION_ID}}");
    let cancel_url = format!("{web_origin}/");

    let mut params = CreateCheckoutSession::new();
    params.mode = Some(CheckoutSessionMode::Payment);
    // ACH debit runs 0.8% capped at $5 vs 2.9% + 30¢ for cards; offer both
    // and let the customer pick
    params.payment_method_types = Some(vec![
        CreateCheckoutSessionPaymentMethodTypes::Card,
        CreateCheckoutSessionPaymentMethodTypes::UsBankAccount,
    ]);
    params.success_url = Some(&success_url);
    params.cancel_url = Some(&cancel_url);
    params.line_items = Some(vec![CreateCheckoutSessionLineItems {
        quantity: Some(1),
        price_data: Some(CreateCheckoutSessionLineItemsPriceData {
            currency: Currency::USD,
            unit_amount: Some(checkout.amount_cents),
            product_data: Some(CreateCheckoutSessionLineItemsPriceDataProductData {
                name: checkout.description.clone(),
                ..Default::default()
            }),
            ..Default::default()
        }),
        ..Default::default()
    }]);

    let session = CheckoutSession::create(stripe, params)
        .await
        .map_err(internal_server_error)?;
    let url = session.url.clone().ok_or((
        StatusCode::INTERNAL_SERVER_ERROR,
        "checkout session has no url".to_string(),
    ))?;

    Ok(Json(CheckoutCreated {
        session_id: session.id.to_string(),
        url,
    }))
}

#[derive(Serialize)]
struct SessionStatus {
    id: String,
    payment_status: &'static str,
    amount_total: Option<i64>,
    currency: Option<String>,
}

// The SPA's /success route reads ?session_id and fetches this to render the
// receipt — telling a settled card payment ("paid") apart from an ACH debit
// that is still clearing ("unpaid").
async fn get_session(
    State(db): State<Db>,
    Path(id): Path<String>,
) -> Result<Json<SessionStatus>, ServerError> {
    let stripe = db.stripe.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "payments are not configured".to_string(),
    ))?;

    let id = id
        .parse::<CheckoutSessionId>()
        .map_err(|_| (StatusCode::BAD_REQUEST, "invalid session id".to_string()))?;

    let session = CheckoutSession::retrieve(stripe, &id, &[])
        .await
        .map_err(internal_server_error)?;

    Ok(Json(SessionStatus {
        id: session.id.to_string(),
        payment_status: payment_status_str(session.payment_status),
        amount_total: session.amount_total,
        currency: session.currency.map(|currency| currency.to_string()),
    }))
}

// Cards settle inside the session (paid); ACH debits land unpaid and settle
// days later. The frontend keys its receipt messaging on this.
fn payment_status_str(status: CheckoutSessionPaymentStatus) -> &'static str {
    match status {
        CheckoutSessionPaymentStatus::Paid => "paid",
        CheckoutSessionPaymentStatus::Unpaid => "unpaid",
        _ => "no_payment_required",
    }
}

async fn stripe_webhook(
    State(db): State<Db>,
    headers: HeaderMap,
    body: String,
) -> Result<StatusCode, ServerError> {
    let secret = db.webhook_secret.as_ref().ok_or((
        StatusCode::SERVICE_UNAVAILABLE,
        "payments are not configured".to_string(),
    ))?;

    let signature = headers
        .get("stripe-signature")
        .and_then(|value| value.to_str().ok())
        .ok_or((
            StatusCode::BAD_REQUEST,
            "missing stripe-signature header".to_string(),
        ))?;

    let event = Webhook::construct_event(&body, signature, secret)
        .map_err(|err| (StatusCode::BAD_REQUEST, err.to_string()))?;

    if let EventObject::CheckoutSession(session) = event.data.object {
        if recordable(event.type_, &session) {
            db.record_payment(event.id.as_str(), &session).await?;
        } else if event.type_ == EventType::CheckoutSessionAsyncPaymentFailed {
            // the debit bounced; nothing was recorded, but leave a trail
            tracing::warn!(session = %session.id, "async payment failed");
        }
    }

    // unhandled event types are acknowledged so Stripe stops retrying them
    Ok(StatusCode::OK)
}

// Cards settle inside the session, so completed arrives already Paid. ACH
// debits complete the session Unpaid and settle days later via
// async_payment_succeeded — payment_status, not the event type, decides
// whether money actually moved.
fn recordable(event_type: EventType, session: &CheckoutSession) -> bool {
    matches!(
        event_type,
        EventType::CheckoutSessionCompleted | EventType::CheckoutSessionAsyncPaymentSucceeded
    ) && session.payment_status == CheckoutSessionPaymentStatus::Paid
}

async fn list_payments(State(db): State<Db>) -> Result<Json<Vec<Payment>>, ServerError> {
    let mut payments = Vec::new();
    let mut start_key = None;

    loop {
        let page = db
            .client
            .scan()
            .table_name(&db.payments_table)
            .set_exclusive_start_key(start_key)
            .send()
            .await
            .map_err(internal_server_error)?;

        payments.extend(page.items().iter().filter_map(item_to_payment));

        start_key = page.last_evaluated_key().map(|key| key.clone());
        if start_key.is_none() {
            break;
        }
    }

    payments.sort_by_key(|payment| std::cmp::Reverse(payment.created));
    Ok(Json(payments))
}

fn internal_server_error<E: std::error::Error>(err: E) -> ServerError {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    // required to enable CloudWatch error logging by the runtime
    tracing::init_default_subscriber();

    let db = Db::new().await;

    // Set up the API routes
    let posts_api = Router::new()
        .route("/", get(list_posts).post(create_post))
        .route("/:id", get(get_post).delete(delete_post));
    let app = Router::new()
        .nest("/posts", posts_api)
        .route("/checkout", post(create_checkout))
        .route("/sessions/:id", get(get_session))
        .route("/payments", get(list_payments))
        .route("/webhooks/stripe", post(stripe_webhook))
        .with_state(db);

    run(app).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn item_round_trips_to_post() {
        let item = HashMap::from([
            ("id".to_string(), AttributeValue::N("7".to_string())),
            ("title".to_string(), AttributeValue::S("title".to_string())),
            (
                "content".to_string(),
                AttributeValue::S("content".to_string()),
            ),
            ("published".to_string(), AttributeValue::Bool(true)),
        ]);

        let post = item_to_post(&item).unwrap();
        assert_eq!(post.id, 7);
        assert_eq!(post.title, "title");
        assert_eq!(post.content, "content");
        assert!(post.published);
    }

    #[test]
    fn payment_item_round_trips() {
        let item = HashMap::from([
            (
                "event_id".to_string(),
                AttributeValue::S("evt_1".to_string()),
            ),
            (
                "session_id".to_string(),
                AttributeValue::S("cs_test_1".to_string()),
            ),
            (
                "amount_total".to_string(),
                AttributeValue::N("500".to_string()),
            ),
            ("currency".to_string(), AttributeValue::S("usd".to_string())),
            (
                "created".to_string(),
                AttributeValue::N("1765000000".to_string()),
            ),
        ]);

        let payment = item_to_payment(&item).unwrap();
        assert_eq!(payment.event_id, "evt_1");
        assert_eq!(payment.amount_total, 500);
        assert_eq!(payment.created, 1765000000);

        let incomplete = HashMap::from([(
            "event_id".to_string(),
            AttributeValue::S("evt_2".to_string()),
        )]);
        assert!(item_to_payment(&incomplete).is_none());
    }

    fn session_with_status(status: CheckoutSessionPaymentStatus) -> CheckoutSession {
        CheckoutSession {
            payment_status: status,
            ..Default::default()
        }
    }

    #[test]
    fn card_payment_records_on_completed() {
        let paid = session_with_status(CheckoutSessionPaymentStatus::Paid);
        assert!(recordable(EventType::CheckoutSessionCompleted, &paid));
    }

    #[test]
    fn ach_records_only_when_money_lands() {
        // completed fires when the customer commits, before the debit clears
        let in_flight = session_with_status(CheckoutSessionPaymentStatus::Unpaid);
        assert!(!recordable(EventType::CheckoutSessionCompleted, &in_flight));

        // settlement arrives days later on async_payment_succeeded
        let settled = session_with_status(CheckoutSessionPaymentStatus::Paid);
        assert!(recordable(
            EventType::CheckoutSessionAsyncPaymentSucceeded,
            &settled
        ));

        let bounced = session_with_status(CheckoutSessionPaymentStatus::Unpaid);
        assert!(!recordable(
            EventType::CheckoutSessionAsyncPaymentFailed,
            &bounced
        ));
    }

    #[test]
    fn free_sessions_never_hit_the_ledger() {
        let free = session_with_status(CheckoutSessionPaymentStatus::NoPaymentRequired);
        assert!(!recordable(EventType::CheckoutSessionCompleted, &free));
    }

    // A real checkout.session.async_payment_succeeded event captured from Stripe
    // via `stripe trigger`. Stripe's fixture exercises SEPA debit, but the event
    // envelope is identical to what us_bank_account ACH emits — the handler keys
    // only on event type, object type, and payment_status, none of which differ
    // by debit network. This guards the seam the unit tests above can't reach:
    // that async-stripe deserializes a live event into EventObject::CheckoutSession
    // with a populated payment_status, exactly as Webhook::construct_event does
    // once the signature checks out.
    #[test]
    fn real_async_payment_event_deserializes_and_records() {
        let body = include_str!("../tests/fixtures/ach_async_payment_succeeded.json");
        let event: stripe::Event = serde_json::from_str(body).expect("event deserializes");

        assert_eq!(event.type_, EventType::CheckoutSessionAsyncPaymentSucceeded);

        let EventObject::CheckoutSession(session) = event.data.object else {
            panic!("async_payment_succeeded should carry a checkout.session object");
        };
        assert_eq!(session.payment_status, CheckoutSessionPaymentStatus::Paid);
        assert!(recordable(event.type_, &session));
    }

    #[test]
    fn counter_item_is_not_a_post() {
        let counter = HashMap::from([
            ("id".to_string(), AttributeValue::N("0".to_string())),
            ("next_id".to_string(), AttributeValue::N("41".to_string())),
        ]);

        assert!(item_to_post(&counter).is_none());
    }

    #[test]
    fn payment_status_maps_to_stable_strings() {
        assert_eq!(payment_status_str(CheckoutSessionPaymentStatus::Paid), "paid");
        assert_eq!(
            payment_status_str(CheckoutSessionPaymentStatus::Unpaid),
            "unpaid"
        );
    }
}
