use axum::http::{HeaderValue, Method};
use axum::routing::{get, post};
use axum::Router;
use sqlx::PgPool;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;

use crate::auth::router::{get_auth_mode, post_login};
use crate::config::{AuthMode, Config};
use crate::harness::router::{get_dashboard, get_feature_log, get_project_state, get_projects};

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
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]);

    let mut router = Router::new()
        .route("/api/auth/mode", get(get_auth_mode))
        .route("/api/harness/projects", get(get_projects))
        .route("/api/harness/projects/{slug}/state", get(get_project_state))
        .route(
            "/api/harness/projects/{slug}/features/{name}/log",
            get(get_feature_log),
        )
        .route("/api/harness/dashboard", get(get_dashboard));
    if config.auth.mode() == AuthMode::Local {
        router = router.route("/api/auth/login", post(post_login));
    }

    router
        .with_state(state)
        .layer(TraceLayer::new_for_http())
        .layer(cors)
}
