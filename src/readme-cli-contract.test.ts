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

  it('documents the standardized language capability matrix', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf-8');

    expect(readme).toContain('### Language Capability Matrix');
    expect(readme).toContain('| Language | Generated Tests | README | Custom Scaffold | Publish Workflow | Distinct Build Step |');
    expect(readme).toContain('| TypeScript | Yes | Yes | Yes | Yes | Yes |');
    expect(readme).toContain('| Rust | Yes | Yes | Yes | Yes | Yes |');
    expect(readme).toContain('| Dart | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Python | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Go | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Java | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Swift | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Kotlin | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Flutter | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| C# | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| PHP | Yes | Yes | Yes | Yes | No |');
    expect(readme).toContain('| Ruby | Yes | Yes | Yes | Yes | No |');
  });

  it('documents the machine-readable languages catalog flow', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf-8');

    expect(readme).toContain('sdkgen languages --json');
    expect(readme).toContain('The `languages` command can also emit the full machine-readable capability catalog');
  });
});
