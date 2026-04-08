import { getPhpNamespace, getPhpPackageName } from './config.js';
export class BuildConfigGenerator {
    generate(config) {
        return [this.generateComposerJson(config)];
    }
    generateComposerJson(config) {
        const packageName = getPhpPackageName(config);
        const namespace = `${getPhpNamespace(config)}\\`;
        return {
            path: 'composer.json',
            content: `${JSON.stringify({
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
            }, null, 2)}\n`,
            language: 'php',
            description: 'Composer manifest',
        };
    }
}
