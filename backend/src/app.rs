use axum::http::{HeaderValue, Method};
use axum::routing::get;
use axum::Router;
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::config::Config;
use crate::harness::router::get_harness_state;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Config,
}

pub fn build_app(pool: PgPool, config: Config) -> Router {
    let state = AppState {
        pool,
        config: config.clone(),
    };

    let frontend_origin = HeaderValue::from_str(&config.frontend_origin)
        .expect("FRONTEND_ORIGIN must be a valid header value");
    let cors = CorsLayer::new()
        .allow_origin(frontend_origin)
        .allow_methods([Method::GET])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]);

    Router::new()
        .route("/api/harness/state", get(get_harness_state))
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
}
