use std::sync::Arc;

use axum::{
    extract::{Path, State},
    response::Json,
    routing::get,
    Router,
};
use diesel::prelude::*;
use diesel_migrations::{embed_migrations, EmbeddedMigrations, MigrationHarness};
use lambda_http::{http::StatusCode, run, tracing, Error};
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

const MIGRATIONS: EmbeddedMigrations = embed_migrations!("src/migrations");
const DB_LOCAL_PATH: &str = "/tmp/accept-payments.sqlite3";

table! {
    posts (id) {
        id -> Integer,
        title -> Text,
        content -> Text,
        published -> Bool,
    }
}

#[derive(Default, Queryable, Selectable, Serialize)]
struct Post {
    id: i32,
    title: String,
    content: String,
    published: bool,
}

#[derive(Deserialize, Insertable)]
#[diesel(table_name = posts)]
struct NewPost {
    title: String,
    content: String,
    published: bool,
}

type ServerError = (StatusCode, String);

/// SQLite database stored as a flat file in S3. Each request refreshes the
/// /tmp copy when the object's ETag has moved on, and mutations upload the
/// file back. Concurrent instances would still race (last writer wins), so
/// the deploy pins the function at reserved concurrency 1.
#[derive(Clone)]
struct Db {
    s3: aws_sdk_s3::Client,
    bucket: String,
    key: String,
    etag: Arc<Mutex<Option<String>>>,
}

impl Db {
    async fn new() -> Result<Self, Error> {
        let config = aws_config::load_defaults(aws_config::BehaviorVersion::latest()).await;
        Ok(Self {
            s3: aws_sdk_s3::Client::new(&config),
            bucket: std::env::var("DB_BUCKET")?,
            key: std::env::var("DB_OBJECT_KEY")
                .unwrap_or_else(|_| "accept-payments.sqlite3".to_string()),
            etag: Arc::new(Mutex::new(None)),
        })
    }

    async fn query<T, F>(&self, mutates: bool, query: F) -> Result<T, ServerError>
    where
        F: FnOnce(&mut SqliteConnection) -> QueryResult<T> + Send + 'static,
        T: Send + 'static,
    {
        // The lock guards the cached ETag and serializes file access within
        // this instance.
        let mut etag = self.etag.lock().await;
        self.pull_if_stale(&mut etag).await?;

        let result = tokio::task::spawn_blocking(move || {
            let mut conn =
                SqliteConnection::establish(DB_LOCAL_PATH).map_err(internal_server_error)?;
            conn.run_pending_migrations(MIGRATIONS)
                .map_err(|err| (StatusCode::INTERNAL_SERVER_ERROR, err.to_string()))?;
            query(&mut conn).map_err(internal_server_error)
        })
        .await
        .map_err(internal_server_error)??;

        if mutates {
            self.push(&mut etag).await?;
        }

        Ok(result)
    }

    async fn pull_if_stale(&self, etag: &mut Option<String>) -> Result<(), ServerError> {
        let head = self
            .s3
            .head_object()
            .bucket(&self.bucket)
            .key(&self.key)
            .send()
            .await;

        let remote = match head {
            Ok(head) => head.e_tag,
            // No object yet: first boot. The migrations create the schema
            // locally and the first write uploads it.
            Err(err) if err.as_service_error().is_some_and(|err| err.is_not_found()) => {
                *etag = None;
                return Ok(());
            }
            Err(err) => return Err(internal_server_error(err)),
        };

        if *etag != remote || !std::path::Path::new(DB_LOCAL_PATH).exists() {
            let object = self
                .s3
                .get_object()
                .bucket(&self.bucket)
                .key(&self.key)
                .send()
                .await
                .map_err(internal_server_error)?;
            let bytes = object
                .body
                .collect()
                .await
                .map_err(internal_server_error)?
                .into_bytes();
            std::fs::write(DB_LOCAL_PATH, &bytes).map_err(internal_server_error)?;
            *etag = remote;
        }

        Ok(())
    }

    async fn push(&self, etag: &mut Option<String>) -> Result<(), ServerError> {
        let body = aws_sdk_s3::primitives::ByteStream::from_path(DB_LOCAL_PATH)
            .await
            .map_err(internal_server_error)?;
        let put = self
            .s3
            .put_object()
            .bucket(&self.bucket)
            .key(&self.key)
            .body(body)
            .send()
            .await
            .map_err(internal_server_error)?;
        *etag = put.e_tag;
        Ok(())
    }
}

async fn create_post(
    State(db): State<Db>,
    Json(post): Json<NewPost>,
) -> Result<Json<Post>, ServerError> {
    let post = db
        .query(true, move |conn| {
            diesel::insert_into(posts::table)
                .values(post)
                .returning(Post::as_returning())
                .get_result(conn)
        })
        .await?;

    Ok(Json(post))
}

async fn list_posts(State(db): State<Db>) -> Result<Json<Vec<Post>>, ServerError> {
    let posts = db
        .query(false, |conn| {
            posts::table
                .filter(posts::dsl::published.eq(true))
                .load(conn)
        })
        .await?;

    Ok(Json(posts))
}

async fn get_post(
    State(db): State<Db>,
    Path(post_id): Path<i32>,
) -> Result<Json<Post>, ServerError> {
    let post = db
        .query(false, move |conn| posts::table.find(post_id).first(conn))
        .await?;

    Ok(Json(post))
}

async fn delete_post(State(db): State<Db>, Path(post_id): Path<i32>) -> Result<(), ServerError> {
    db.query(true, move |conn| {
        diesel::delete(posts::table.find(post_id)).execute(conn)
    })
    .await?;

    Ok(())
}

fn internal_server_error<E: std::error::Error>(err: E) -> ServerError {
    (StatusCode::INTERNAL_SERVER_ERROR, err.to_string())
}

#[tokio::main]
async fn main() -> Result<(), Error> {
    // required to enable CloudWatch error logging by the runtime
    tracing::init_default_subscriber();

    let db = Db::new().await?;

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
    fn migrations_and_crud_round_trip() {
        let mut conn = SqliteConnection::establish(":memory:").unwrap();
        conn.run_pending_migrations(MIGRATIONS).unwrap();

        let post: Post = diesel::insert_into(posts::table)
            .values(NewPost {
                title: "title".to_string(),
                content: "content".to_string(),
                published: true,
            })
            .returning(Post::as_returning())
            .get_result(&mut conn)
            .unwrap();
        assert_eq!(post.id, 1);
        assert!(post.published);

        let published: Vec<Post> = posts::table
            .filter(posts::dsl::published.eq(true))
            .load(&mut conn)
            .unwrap();
        assert_eq!(published.len(), 1);

        diesel::delete(posts::table.find(post.id))
            .execute(&mut conn)
            .unwrap();
        let remaining: i64 = posts::table.count().get_result(&mut conn).unwrap();
        assert_eq!(remaining, 0);
    }
}
