import { getRustCrateName, getRustPackageName } from './config.js';
export class BuildConfigGenerator {
    generate(config) {
        return [this.generateCargoToml(config)];
    }
    generateCargoToml(config) {
        const packageName = getRustPackageName(config);
        const crateName = getRustCrateName(config);
        return {
            path: 'Cargo.toml',
            content: this.format(`[package]
name = "${packageName}"
version = "${config.version}"
edition = "2021"
description = "${escapeToml(config.description || `${config.name} SDK`)}"
license = "${config.license || 'MIT'}"
authors = ["${escapeToml(config.author || 'SDKWork Team')}"]

[lib]
name = "${crateName}"
path = "src/lib.rs"

[dependencies]
reqwest = { version = "0.12", default-features = false, features = ["json", "multipart", "rustls-tls"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
thiserror = "1.0"

[dev-dependencies]
tokio = { version = "1.0", features = ["macros", "rt-multi-thread"] }`),
            language: 'rust',
            description: 'Rust Cargo manifest',
        };
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
function escapeToml(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
