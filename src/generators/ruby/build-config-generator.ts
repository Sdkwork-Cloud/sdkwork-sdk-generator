import type { GeneratedFile } from '../../framework/base.js';
import type { GeneratorConfig } from '../../framework/types.js';
import { getRubyGemName, getRubyRootRequirePath } from './config.js';

export class BuildConfigGenerator {
  generate(config: GeneratorConfig): GeneratedFile[] {
    const files = [
      this.generateGemspec(config),
      this.generateGemfile(),
    ];
    if (config.generateTests === true) {
      files.push(this.generateRakefile());
    }
    return files;
  }

  private generateGemspec(config: GeneratorConfig): GeneratedFile {
    const gemName = getRubyGemName(config);

    return {
      path: `${gemName}.gemspec`,
      content: this.format(`# frozen_string_literal: true

require_relative 'lib/${getRubyRootRequirePath(config)}/version'

Gem::Specification.new do |spec|
  spec.name = '${escapeRubyString(gemName)}'
  spec.version = ${getRubyVersionConstant(config)}
  spec.authors = ['${escapeRubyString(config.author || 'SDKWork Team')}']
  spec.summary = '${escapeRubyString(config.description || `${config.name} Ruby SDK`)}'
  spec.description = '${escapeRubyString(config.description || `${config.name} Ruby SDK`)}'
  spec.license = '${escapeRubyString(config.license || 'MIT')}'
  spec.required_ruby_version = '>= 3.0'
  spec.files = Dir.glob('lib/**/*') + ['README.md', '${escapeRubyString(gemName)}.gemspec']
  spec.require_paths = ['lib']
  spec.add_dependency 'faraday', '~> 2.9'
${config.generateTests === true
  ? "  spec.add_development_dependency 'minitest', '~> 5.22'\n  spec.add_development_dependency 'rake', '~> 13.2'\n"
  : ''}  spec.metadata['homepage_uri'] = 'https://github.com/sdkwork/spring-ai-plus'
  spec.metadata['source_code_uri'] = 'https://github.com/sdkwork/spring-ai-plus'
end
`),
      language: 'ruby',
      description: 'Ruby gemspec',
    };
  }

  private generateGemfile(): GeneratedFile {
    return {
      path: 'Gemfile',
      content: this.format(`source 'https://rubygems.org'

gemspec
`),
      language: 'ruby',
      description: 'Gemfile',
    };
  }

  private generateRakefile(): GeneratedFile {
    return {
      path: 'Rakefile',
      content: this.format(`require 'rake/testtask'

Rake::TestTask.new(:test) do |test|
  test.libs << 'test'
  test.pattern = 'test/**/*_test.rb'
end

task default: :test
`),
      language: 'ruby',
      description: 'Rake test task',
    };
  }

  private format(content: string): string {
    return `${content.trim()}\n`;
  }
}

function getRubyVersionConstant(config: GeneratorConfig): string {
  return `${getRubyRootRequirePath(config)
    .split('/')
    .map((segment) => segment
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(''))
    .join('::')}::VERSION`;
}

function escapeRubyString(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
