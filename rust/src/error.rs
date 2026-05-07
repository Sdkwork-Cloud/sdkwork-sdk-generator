use crate::models::GenerationStatus;
use thiserror::Error;

pub type SdkGeneratorResult<T> = Result<T, SdkGeneratorError>;

#[derive(Debug, Error)]
pub enum SdkGeneratorError {
    #[error("invalid configuration: {0}")]
    InvalidConfiguration(String),
    #[error("http error: {0}")]
    Http(#[from] reqwest::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("sdk generator http status {status}: {body}")]
    HttpStatus { status: u16, body: String },
    #[error("sdk generation job {job_id} failed with status {status:?}")]
    GenerationFailed {
        job_id: String,
        status: GenerationStatus,
    },
    #[error("sdk generation job {job_id} did not complete after {attempts} polling attempts")]
    GenerationTimeout { job_id: String, attempts: usize },
}
