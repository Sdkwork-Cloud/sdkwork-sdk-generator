import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getRustCrateName, getRustPackageName } from './config.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    return [this.generateCargoToml(config)];
  }

  private generateCargoToml(config: GeneratorConfig): GeneratedFile {
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

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function escapeToml(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
