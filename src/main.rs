use std::collections::HashMap;

use aws_sdk_dynamodb::types::{AttributeValue, ReturnValue};
use axum::{
    extract::{Path, State},
    response::Json,
    routing::get,
    Router,
};
use lambda_http::{http::StatusCode, run, tracing, Error};
use serde::{Deserialize, Serialize};

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

type ServerError = (StatusCode, String);

#[derive(Clone)]
struct Db {
    client: aws_sdk_dynamodb::Client,
    table: String,
}

impl Db {
    async fn new() -> Self {
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        Self {
            client: aws_sdk_dynamodb::Client::new(&config),
            table: std::env::var("DB_TABLE")
                .unwrap_or_else(|_| "accept-payments-posts".to_string()),
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
    let app = Router::new().nest("/posts", posts_api).with_state(db);

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
    fn counter_item_is_not_a_post() {
        let counter = HashMap::from([
            ("id".to_string(), AttributeValue::N("0".to_string())),
            ("next_id".to_string(), AttributeValue::N("41".to_string())),
        ]);

        assert!(item_to_post(&counter).is_none());
    }
}
