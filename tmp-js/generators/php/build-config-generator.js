import { getPhpNamespace, getPhpPackageName } from './config.js';
export class BuildConfigGenerator {
    generate(config) {
        const files = [this.generateComposerJson(config)];
        if (config.generateTests === true) {
            files.push(this.generatePhpUnitConfig());
        }
        return files;
    }
    generateComposerJson(config) {
        const packageName = getPhpPackageName(config);
        const namespace = `${getPhpNamespace(config)}\\`;
        const manifest = {
            name: packageName,
            description: config.description || `${config.name} PHP SDK`,
            type: 'library',
            license: config.license || 'MIT',
            authors: [
                {
                    name: config.author || 'SDKWork Team',
                },
            ],
            require: {
                php: '^8.1',
                'guzzlehttp/guzzle': '^7.8',
            },
            autoload: {
                'psr-4': {
                    [namespace]: 'src/',
                },
            },
            'minimum-stability': 'stable',
        };
        if (config.generateTests === true) {
            manifest['require-dev'] = {
                'phpunit/phpunit': '^11.0',
            };
            manifest.scripts = {
                test: 'vendor/bin/phpunit',
            };
        }
        return {
            path: 'composer.json',
            content: `${JSON.stringify(manifest, null, 2)}\n`,
            language: 'php',
            description: 'Composer manifest',
        };
    }
    generatePhpUnitConfig() {
        return {
            path: 'phpunit.xml.dist',
            content: `<?xml version="1.0" encoding="UTF-8"?>\n<phpunit bootstrap="vendor/autoload.php" cacheDirectory=".phpunit.cache">\n  <testsuites>\n    <testsuite name="sdk">\n      <directory>tests</directory>\n    </testsuite>\n  </testsuites>\n</phpunit>\n`,
            language: 'php',
            description: 'PHPUnit configuration',
        };
    }
}
