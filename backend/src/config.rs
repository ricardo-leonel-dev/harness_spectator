use std::env;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("missing required environment variable: {0}")]
    Missing(&'static str),
    #[error("invalid value for environment variable {0}: {1}")]
    Invalid(&'static str, String),
}

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub supabase_jwt_secret: String,
    pub frontend_origin: String,
    pub project_slug: String,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let port_raw = env::var("PORT").unwrap_or_else(|_| "4000".to_string());
        let port = port_raw
            .parse::<u16>()
            .map_err(|e| ConfigError::Invalid("PORT", e.to_string()))?;

        let database_url = require_env("DATABASE_URL")?;
        let supabase_jwt_secret = require_env("SUPABASE_JWT_SECRET")?;
        let frontend_origin = require_env("FRONTEND_ORIGIN")?;
        let project_slug = require_env("PROJECT_SLUG")?;

        Ok(Self {
            port,
            database_url,
            supabase_jwt_secret,
            frontend_origin,
            project_slug,
        })
    }
}

fn require_env(name: &'static str) -> Result<String, ConfigError> {
    match env::var(name) {
        Ok(v) if !v.is_empty() => Ok(v),
        Ok(_) => Err(ConfigError::Missing(name)),
        Err(_) => Err(ConfigError::Missing(name)),
    }
}
