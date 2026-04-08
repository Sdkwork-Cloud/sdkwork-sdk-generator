import { getRubyGemName, getRubyRootRequirePath } from './config.js';
export class BuildConfigGenerator {
    generate(config) {
        return [
            this.generateGemspec(config),
            this.generateGemfile(),
        ];
    }
    generateGemspec(config) {
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
  spec.metadata['homepage_uri'] = 'https://github.com/sdkwork/spring-ai-plus'
  spec.metadata['source_code_uri'] = 'https://github.com/sdkwork/spring-ai-plus'
end
`),
            language: 'ruby',
            description: 'Ruby gemspec',
        };
    }
    generateGemfile() {
        return {
            path: 'Gemfile',
            content: this.format(`source 'https://rubygems.org'

gemspec
`),
            language: 'ruby',
            description: 'Gemfile',
        };
    }
    format(content) {
        return `${content.trim()}\n`;
    }
}
function getRubyVersionConstant(config) {
    return `${getRubyRootRequirePath(config)
        .split('/')
        .map((segment) => segment
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(''))
        .join('::')}::VERSION`;
}
function escapeRubyString(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
