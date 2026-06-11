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

  it('documents rpc convention mode separately from http control-plane output', () => {
    const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf-8');

    expect(readme).toContain('### Inspect Generated SDK Evidence');
    expect(readme).toContain('HTTP/OpenAPI inspect reads persisted generated SDK control-plane artifacts.');
    expect(readme).toContain('RPC inspect validates convention evidence by default and validates emitted control-plane metadata only when present.');
    expect(readme).toContain('generated SDK evidence snapshot');
    expect(readme).toContain("import { readGeneratedSdkEvidenceSnapshot } from '@sdkwork/sdk-generator/node/control-plane';");
    expect(readme).not.toContain('control-plane snapshot');
    expect(readme).not.toContain("import { readGenerateControlPlaneSnapshot } from '@sdkwork/sdk-generator/node/control-plane';");
    expect(readme).not.toContain('### Inspect SDK Control Plane');
    expect(readme).toContain('RPC generation defaults to convention-first source output');
    expect(readme).toContain('does not write persisted generator evidence');
    expect(readme).toContain('`sdkgen inspect --protocol rpc`');
    expect(readme).toContain('`--emit-control-plane`');
    expect(readme).toContain('the evidence paths are derived by generator convention');
    expect(readme).toContain('| `--emit-control-plane` | Emit optional persisted generator evidence for RPC release, CI, audit, or migration workflows; HTTP/OpenAPI generation already persists its standard control plane | No | `false` |');
    expect(readme).not.toContain('`.sdkwork/sdkwork-generator-*`');
    expect(readme).toContain('HTTP/OpenAPI generated SDKs follow these control-plane regeneration rules');
    expect(readme).toContain('HTTP/OpenAPI generated SDK layouts reserve these stable cross-language paths');
  });

  it('keeps rpc control-plane CLI help convention-first', () => {
    const cliSource = readFileSync(resolve(process.cwd(), 'src/cli.ts'), 'utf-8');

    expect(cliSource).toContain(".description('Inspect generated SDK evidence')");
    expect(cliSource).not.toContain(".description('Inspect persisted SDK control-plane artifacts')");
    expect(cliSource).toContain(
      ".option('--emit-control-plane', 'Emit optional persisted generator evidence for RPC release, CI, audit, or migration workflows')",
    );
    expect(cliSource).not.toContain('Emit optional .sdkwork/sdkwork-generator-* evidence');
  });
});
