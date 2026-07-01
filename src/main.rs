use lambda_runtime::{run, service_fn, Error, LambdaEvent};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use std::env;

// Define your database schema here
#[derive(Debug, sqlx::FromRow)]
struct User {
    id: i32,
    email: String,
    stripe_customer_id: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    let handler = service_fn(handle_request);
    run(handler).await?;
    Ok(())
}

async fn handle_request(event: LambdaEvent<Value>) -> Result<Value, Error> {
    // Parse the request payload
    let payload = event.payload;
    let email = payload.get("email").unwrap().as_str().unwrap().to_string();
    let payment_amount = payload.get("amount").unwrap().as_f64().unwrap();

    // Connect to the database
    let db_url = env::var("DATABASE_URL").unwrap();
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await
        .unwrap();

    // Authorize the user
    let user = authorize_user(&pool, &email).await?;

    // Create a Stripe customer if not already existing
    let stripe_customer_id = match user.stripe_customer_id {
        Some(customer_id) => customer_id,
        None => create_stripe_customer(&email).await?,
    };

    // Charge the customer via Stripe
    let payment_intent = charge_customer(&stripe_customer_id, payment_amount).await?;

    // Return the payment status
    Ok(json!({
        "status": "success",
        "payment_intent": payment_intent
    }))
}

async fn authorize_user(pool: &sqlx::PgPool, email: &str) -> Result<User, Error> {
    let user = sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
        .bind(email)
        .fetch_one(pool)
        .await
        .map_err(|e| Error::from(e.to_string()))?;

    Ok(user)
}

async fn create_stripe_customer(email: &str) -> Result<String, Error> {
    // Use the Stripe API to create a new customer
    let customer = stripe::Customer::create(&[
        ("email", email),
        // Add any other customer details as needed
    ])
    .await
    .map_err(|e| Error::from(e.to_string()))?;

    Ok(customer.id)
}

async fn charge_customer(
    stripe_customer_id: &str,
    amount: f64,
) -> Result<String, Error> {
    // Use the Stripe API to create a payment intent and charge the customer
    let payment_intent = stripe::PaymentIntent::create(&[
        ("customer", stripe_customer_id),
        ("amount", (amount * 100.0) as i64), // Stripe uses cents
        ("currency", "usd"),
        // Add any other payment details as needed
    ])
    .await
    .map_err(|e| Error::from(e.to_string()))?;

    Ok(payment_intent.id)
}
