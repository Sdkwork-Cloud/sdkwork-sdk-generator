# Repository Guidelines

## Project Structure & Module Organization
`src/` is the source of truth. Core generator contracts live under `src/framework/`, CLI entrypoints and orchestration live in top-level `src/*.ts`, and each language generator has its own folder under `src/generators/<language>/` with the usual split of `config.ts`, `model-generator.ts`, `api-generator.ts`, `http-generator.ts`, `build-config-generator.ts`, and `readme-generator.ts`. Most tests are colocated as `src/**/*.test.ts`; `test/` is reserved for broader helper or verification scripts. `bin/` contains CLI shims, while `dist/` and `tmp-js/` are build outputs and should not be edited by hand.

## Build, Test, and Development Commands
Use Node 18+.

- `npm install` installs local dependencies.
- `npm run build` emits declarations to `dist/`, bundles the library with Vite, and builds runtime entrypoints.
- `npm test` runs the Vitest suite.
- `npx vitest run src/generators/java/java-generator.test.ts` runs a focused regression test while iterating.
- `npm run dev` rebuilds in watch mode.
- `node bin/sdkgen.js generate -i .\\test-openapi.json -o .\\tmp-out -n Demo -l typescript --dry-run` is a quick CLI smoke test.

## Coding Style & Naming Conventions
Write strict TypeScript with 2-space indentation and ES module syntax. Keep relative imports explicit with `.js` suffixes inside `.ts` files, matching the current source layout. Use `PascalCase` for classes and generator types, `camelCase` for functions and variables, and `kebab-case` for filenames. Follow the existing small-module pattern instead of adding large cross-language files.

## Testing Guidelines
Use Vitest (`describe`, `it`, `expect`) and place tests next to the code they protect. Name files `*.test.ts`. Favor targeted assertions on generated file paths and contents over broad snapshots so regressions stay readable. There is no enforced coverage threshold in this package, so every behavior change should add or update the closest regression test.

## Commit & Pull Request Guidelines
Recent history follows short conventional subjects such as `feat: ...`, `fix: ...`, and `chore: ...`; keep commits imperative and focused. For pull requests, summarize the affected generators or CLI flows, list the verification you ran (`npm test`, targeted Vitest runs, CLI dry-run output), and include before/after examples when generated SDK output changes. Link the relevant issue when one exists.
