# Repository Guidelines

<!-- SDKWORK-AGENTS-GENERATED: v1 -->

## SDKWORK Soul

Read `../sdkwork-specs/SOUL.md` before executing tasks in this root. Follow specs before memory, dictionary before context, stop on ambiguity, and evidence before completion.

## SDKWORK Standards

Canonical SDKWORK specs path from this root:

- `../sdkwork-specs/README.md`
- `../sdkwork-specs/SOUL.md`
- `../sdkwork-specs/AGENTS_SPEC.md`
- `../sdkwork-specs/CODE_STYLE_SPEC.md`
- `../sdkwork-specs/NAMING_SPEC.md`

Do not copy root standard text into this repository. If these relative paths do not resolve, stop and report the broken workspace layout.

## Application Identity

No `sdkwork.app.config.json` is present at this root. If the task changes application behavior, runtime config, SDK wiring, release metadata, or app-owned capabilities, first locate the nearest application root that has this manifest or add one according to the root specs.

## Local Dictionary Structure

- `AGENTS.md`: local agent entrypoint and relative SDKWORK spec index.
- `CLAUDE.md`: Claude Code compatibility shim that points to `AGENTS.md` and must not duplicate rules.
- `GEMINI.md`: Gemini CLI compatibility shim that points to `AGENTS.md` and must not duplicate rules.
- `CODEX.md`: Codex compatibility shim that points to `AGENTS.md` and must not duplicate rules.
- `sdkwork.app.config.json`: not present here; required for application roots.
- `.sdkwork/`: reserved local dictionary folder; create only for local skills, plugins, manifests, or AI workspace metadata.
- `specs/`: not present here; use when local contracts need to narrow root standards.
- `sdks/`: not present here; use only for SDK authority or generation surfaces.
- `package.json`: language/build manifests.
- Local directories to inspect first when relevant: `bin/`, `rust/`, `src/`, `test/`, `test-support/`, `tmp-js/`.

## Documentation Canon

- [docs/README.md](docs/README.md)
- [docs/product/prd/PRD.md](docs/product/prd/PRD.md)
- [docs/architecture/tech/TECH_ARCHITECTURE.md](docs/architecture/tech/TECH_ARCHITECTURE.md)

## Spec Resolution Order

1. Read this `AGENTS.md` and any nearer component-level `AGENTS.md`.
2. Read `sdkwork.app.config.json` when present.
3. Read local `specs/README.md` and `specs/component.spec.json` when present.
4. Read local `.sdkwork/README.md`, `.sdkwork/skills/`, and `.sdkwork/plugins/` when relevant.
5. Read `../sdkwork-specs/README.md` and the task-specific root specs.
6. Inspect implementation files only after the relevant dictionary entries are clear.

## Required Specs By Task Type

- Agent/workflow changes: `../sdkwork-specs/SOUL.md`, `../sdkwork-specs/AGENTS_SPEC.md`, `../sdkwork-specs/SDKWORK_WORKSPACE_SPEC.md`.
- Any code change: `../sdkwork-specs/CODE_STYLE_SPEC.md`, `../sdkwork-specs/NAMING_SPEC.md`, plus only the touched language/framework spec.
- Rust code: `../sdkwork-specs/RUST_CODE_SPEC.md` and `../sdkwork-specs/RUST_RPC_SPEC.md` when RPC is touched.
- Java/Spring code: `../sdkwork-specs/JAVA_CODE_SPEC.md` and `../sdkwork-specs/WEB_BACKEND_SPEC.md` when HTTP backend behavior is touched.
- TypeScript/Node code: `../sdkwork-specs/TYPESCRIPT_CODE_SPEC.md`.
- Frontend/UI code: `../sdkwork-specs/FRONTEND_CODE_SPEC.md`, `../sdkwork-specs/FRONTEND_SPEC.md`, `../sdkwork-specs/UI_ARCHITECTURE_SPEC.md`, and exactly one detailed UI architecture spec.
- API, SDK, database, runtime, security, and deployment changes must follow the task matrix in `../sdkwork-specs/README.md`.

Language-specific specs are on-demand; do not load Rust, Java, TypeScript, and frontend specs for unrelated tasks.

## Code Style Rules

Read `../sdkwork-specs/CODE_STYLE_SPEC.md` and `../sdkwork-specs/NAMING_SPEC.md` before code changes.

Load language specs only when touched: Rust uses `RUST_CODE_SPEC.md`, Java/Spring uses `JAVA_CODE_SPEC.md`, TypeScript/Node uses `TYPESCRIPT_CODE_SPEC.md`, and frontend/UI uses `FRONTEND_CODE_SPEC.md`.

For TypeScript or frontend code, prefer strict types, explicit package exports, colocated tests, and existing package/module boundaries.

## Build, Test, and Verification

Run commands from this directory unless a command explicitly targets another path.

- `npm install`: install dependencies for this workspace or package.
- `npm run dev`: start the local development server or app shell.
- `npm run build`: build production artifacts or package outputs.
- `npm run test`: run the configured test suite for this scope.
- `npm run lint`: run lint and static checks.
- `npm run build:bundle`: build production artifacts or package outputs.
- `npm run test:vitest`: run the configured test suite for this scope.

Run the narrowest relevant check first, then broader verification when API contracts, SDK generation, persistence, security, or cross-package boundaries change.

## Agent Execution Rules

Use the convention dictionary instead of broad context loading. Do not hand-edit generated SDK output unless the task is explicitly about generated artifacts and the source contract is verified. Do not replace generated SDK integration with raw HTTP. Keep changes scoped to the owning module, package, crate, or app root. Record the exact verification commands and important outputs before reporting completion.

## Human Review Rules

Request human review before breaking SDKWORK standards, changing public naming, altering security/auth behavior, changing database migrations or production deployment config, deleting data/files, or changing generated SDK ownership. Surface unresolved spec paths, app identity conflicts, component ownership conflicts, and API authority ambiguity instead of guessing.

## Existing Local Guidance

The repository-specific guidance below was preserved from the previous `AGENTS.md`. If it conflicts with the SDKWORK sections above or with `../sdkwork-specs/`, the SDKWORK standards win.

### Project Structure & Module Organization
`src/` is the source of truth. Core generator contracts live under `src/framework/`, CLI entrypoints and orchestration live in top-level `src/*.ts`, and each language generator has its own folder under `src/generators/<language>/` with the usual split of `config.ts`, `model-generator.ts`, `api-generator.ts`, `http-generator.ts`, `build-config-generator.ts`, and `readme-generator.ts`. Most tests are colocated as `src/**/*.test.ts`; `test/` is reserved for broader helper or verification scripts. `bin/` contains CLI shims, while `dist/` and `tmp-js/` are build outputs and should not be edited by hand.

### Build, Test, and Development Commands
Use Node 18+.

- `npm install` installs local dependencies.
- `npm run build` emits declarations to `dist/`, bundles the library with Vite, and builds runtime entrypoints.
- `npm test` runs the Vitest suite.
- `npx vitest run src/generators/java/java-generator.test.ts` runs a focused regression test while iterating.
- `npm run dev` rebuilds in watch mode.
- `node bin/sdkgen.js generate -i .\\test-openapi.json -o .\\tmp-out -n Demo -l typescript --dry-run` is a quick CLI smoke test.

### Coding Style & Naming Conventions
Write strict TypeScript with 2-space indentation and ES module syntax. Keep relative imports explicit with `.js` suffixes inside `.ts` files, matching the current source layout. Use `PascalCase` for classes and generator types, `camelCase` for functions and variables, and `kebab-case` for filenames. Follow the existing small-module pattern instead of adding large cross-language files.

### Previous SDKWORK Standards Notes
Before changing domains, APIs, SDK contracts, database schemas, reusable modules, frontend UI/service logic, app manifests, IAM/auth/permission behavior, deployment/runtime configuration, external integrations, events, observability, performance, privacy, or generated-client integration, read the canonical standards in `../sdkwork-specs/README.md` and then the relevant spec files under `../sdkwork-specs/`. Local conventions may extend these standards but must not contradict them.

For generator behavior, `../sdkwork-specs/API_SPEC.md` and `../sdkwork-specs/SDK_SPEC.md` are authoritative. The SDKWork v3 profile must generate nested resource clients from `tag + dotted operationId`, for example tag `auth` and operationId `sessions.create` becomes `client.auth.sessions.create(body)`. Do not introduce flat aliases such as `client.auth.createSession()` for new contracts. The generator must preserve the dual-token header model and the `/app/v3/api` plus `/backend/v3/api` surface split.

### Testing Guidelines
Use Vitest (`describe`, `it`, `expect`) and place tests next to the code they protect. Name files `*.test.ts`. Favor targeted assertions on generated file paths and contents over broad snapshots so regressions stay readable. There is no enforced coverage threshold in this package, so every behavior change should add or update the closest regression test.

### Commit & Pull Request Guidelines
Recent history follows short conventional subjects such as `feat: ...`, `fix: ...`, and `chore: ...`; keep commits imperative and focused. For pull requests, summarize the affected generators or CLI flows, list the verification you ran (`npm test`, targeted Vitest runs, CLI dry-run output), and include before/after examples when generated SDK output changes. Link the relevant issue when one exists.
