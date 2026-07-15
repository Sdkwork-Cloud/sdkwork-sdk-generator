# SDK Generator Local Conventions

- Scope: repository-root execution rules for `@sdkwork/sdk-generator` that narrow, but do not replace, SDKWork standards.
- Related: `AGENTS.md`, `component.spec.json`, `../sdkwork-specs/API_SPEC.md`, `../sdkwork-specs/SDK_SPEC.md`, `../sdkwork-specs/TYPESCRIPT_CODE_SPEC.md`, and `../sdkwork-specs/TEST_SPEC.md`.

Read this document only when a task changes generator implementation, a language emitter, CLI behavior, generated output handling, SDKWork v3 materialization, or the package's local verification workflow. Global SDKWork standards remain authoritative; `component.spec.json` remains the machine-readable component contract.

## 1. Source And Output Ownership

- `src/` is the source of truth.
- `src/framework/` owns core generator contracts.
- Top-level `src/*.ts` files own CLI entrypoints and orchestration.
- Each language generator belongs under `src/generators/<language>/`, using the established small-module split where applicable: `config.ts`, `model-generator.ts`, `api-generator.ts`, `http-generator.ts`, `build-config-generator.ts`, and `readme-generator.ts`.
- Most unit tests are colocated as `src/**/*.test.ts`; `test/` is for broader helper or verification scripts.
- `bin/` owns CLI shims.
- `dist/` and `tmp-js/` are build outputs and MUST NOT be edited by hand. Change authored source or the generator input, then rebuild.

## 2. SDKWork V3 Generator Routing

Before changing a generated SDK contract, read the relevant sections of [`API_SPEC.md`](../../sdkwork-specs/API_SPEC.md), especially API surface and operationId rules, and [`SDK_SPEC.md`](../../sdkwork-specs/SDK_SPEC.md), especially client surface and auth handling.

In this repository, those rules materialize through the framework and language-generator folders above. Keep the SDKWork v3 `tag + dotted operationId` resource path intact; for example, `auth` plus `sessions.create` produces `client.auth.sessions.create(body)`. Do not introduce a generator-local flat alias such as `client.auth.createSession()` for a new contract. Preserve the canonical dual-token behavior and the `/app/v3/api` and `/backend/v3/api` surface split rather than creating local variants.

## 3. Local Build And Test Routing

Use Node 18 or later and select the narrowest command that covers the affected surface:

| Task | Command |
| --- | --- |
| Install dependencies | `npm install` |
| Build declarations, bundles, and runtime entrypoints | `npm run build` |
| Run the Vitest suite | `npm test` |
| Run a focused Java generator regression | `npx vitest run src/generators/java/java-generator.test.ts` |
| Rebuild in watch mode | `npm run dev` |
| Smoke-test the CLI without writing output | `node bin/sdkgen.js generate -i ./test-openapi.json -o ./tmp-out -n Demo -l typescript --dry-run` |

## 4. TypeScript And Regression Conventions

- Use strict TypeScript, 2-space indentation, and ES module syntax.
- Keep relative imports explicit with `.js` suffixes inside `.ts` files, matching the existing source layout.
- Use `PascalCase` for classes and generator types, `camelCase` for functions and variables, and `kebab-case` for filenames.
- Follow the existing small-module pattern instead of adding large cross-language files.
- Use Vitest `describe`, `it`, and `expect`, colocating tests with the code they protect and naming them `*.test.ts`.
- Prefer targeted assertions on generated file paths and contents over broad snapshots so regressions remain readable.
- There is no enforced coverage threshold; every behavior change adds or updates the closest regression test.

## 5. Contribution Expectations

Use focused, imperative Conventional Commit subjects such as `feat: ...`, `fix: ...`, or `chore: ...`.

Pull requests summarize the affected generators or CLI flows, list the verification run (`npm test`, targeted Vitest, or CLI dry-run output), include before-and-after examples when generated SDK output changes, and link the relevant issue when one exists.
