import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('README CLI contract', () => {
  it('documents the init workflow and node init entry consistently', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf-8');

    expect(readme).toContain('### Initialize SDK Workspace');
    expect(readme).toContain('sdkgen init -o ./sdk -n MySDK -l typescript -t backend');
    expect(readme).toContain("import { initializeSdkWorkspace } from '@sdkwork/sdk-generator/node/init';");
    expect(readme).toContain('| `--api-prefix` | API path prefix | No | empty string |');
    expect(readme).toContain('| `--namespace` | Namespace override for languages that support it, such as C# and PHP | No | Language-specific |');
    expect(readme).toContain('| `--author` | Author name | No | `SDKWork Team` |');
  });
});
