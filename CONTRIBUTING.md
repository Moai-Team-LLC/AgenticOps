# Contributing to AgenticOps

Thanks for your interest. AgenticOps is the runtime / operations reference
implementation of the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard)
*Fleet operations* surface — lean by design.

## Development

AgenticOps is **Bun-native** (it uses `bun:sqlite` and `bun:test`). Requires
[Bun](https://bun.sh) ≥ 1.1.

```bash
bun install                      # install dependencies
bunx tsc --noEmit                # type-check
bun test                         # run the test suite
bun run examples/end-to-end.ts   # run the end-to-end demo
```

## Pull requests

- Keep changes small and focused — one concern per PR.
- Add or update tests for any behavior change; `bun test` must pass.
- `bunx tsc --noEmit` must be clean.
- Match the surrounding style; prefer the minimum that solves the problem.

## Commit messages

This repo follows [Conventional Commits](https://www.conventionalcommits.org/):
`type(scope): description` — e.g. `feat(scheduler): …`, `fix(backlog): …`,
`docs(readme): …`. Allowed types: `feat`, `fix`, `docs`, `refactor`, `perf`,
`test`, `build`, `ci`, `chore`.

## Scope

AgenticOps owns the *operations* plane — deployable manifest, bounded runner,
durable backlog, scheduling, fleet observability, inter-agent policy. Agent
*quality* (retrieval, faithfulness) belongs to
[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind); agent
*correctness / conformance* to the Standard. Please keep contributions on the
ops plane.

By contributing, you agree your contributions are licensed under the project's
[Apache-2.0](LICENSE) license.
