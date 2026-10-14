use std::io::{self, BufRead, Write};
use std::process::ExitCode;

use harness_frontend_backend::auth::password::hash_password;

fn main() -> ExitCode {
    let mut line = String::new();
    if let Err(err) = io::stdin().lock().read_line(&mut line) {
        eprintln!("failed to read stdin: {err}");
        return ExitCode::FAILURE;
    }
    let password = line.strip_suffix('\n').unwrap_or(&line);
    let password = password.strip_suffix('\r').unwrap_or(password);
    if password.is_empty() {
        eprintln!("password must not be empty");
        return ExitCode::FAILURE;
    }

    match hash_password(password) {
        Ok(hash) => {
            let mut stdout = io::stdout().lock();
            if writeln!(stdout, "{hash}").is_err() {
                return ExitCode::FAILURE;
            }
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err}");
            ExitCode::FAILURE
        }
    }
}
