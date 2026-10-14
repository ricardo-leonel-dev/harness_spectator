use std::time::Duration;

use sqlx::postgres::PgPoolOptions;
use tokio::net::TcpListener;

use harness_frontend_backend::app::build_app;
use harness_frontend_backend::config::{AuthConfig, Config};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info,sqlx=warn")),
        )
        .init();

    let config = match Config::from_env() {
        Ok(config) => config,
        Err(err) => {
            eprintln!("configuration error: {err}");
            std::process::exit(1);
        }
    };
    match &config.auth {
        AuthConfig::Supabase { .. } => tracing::info!("auth mode: supabase"),
        AuthConfig::Local(local) => {
            tracing::info!(users = local.users.len(), "auth mode: local")
        }
    }

    let pool = PgPoolOptions::new()
        .max_connections(8)
        .acquire_timeout(Duration::from_secs(5))
        .connect(&config.database_url)
        .await?;

    let app = build_app(pool, config.clone());

    let addr = std::net::SocketAddr::from(([0, 0, 0, 0], config.port));
    let listener = TcpListener::bind(addr).await?;
    tracing::info!("harness backend listening on {}", addr);

    axum::serve(listener, app).await?;
    Ok(())
}
