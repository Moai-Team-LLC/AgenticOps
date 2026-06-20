# Changelog

All notable changes to AgenticOps are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-06-20

Initial public release — a lean, Bun-native reference implementation of the
Agentic Product Standard's *Fleet operations* surface.

### Added
- **`manifest`** — agent-as-deployable-artifact: a zod schema + YAML loader with
  `${VAR}` env interpolation, agent-logic kept separate from the platform prompt.
- **`runner`** — bounded execution: explicit max-turns, a wall-clock timeout, and
  graceful cancellation; runtime-agnostic turn injection.
- **`backlog`** — durable SQLite FIFO (`bun:sqlite`): atomic claim + lease,
  expired leases are re-claimable, retry-then-park.
- **`scheduler`** — coordinated cron with a fire-once `fires` ledger across
  replicas, misfire coalescing, and timezone-aware evaluation (IANA via `Intl`).
- **`telemetry`** — append-only operational audit + per-agent heartbeat/health,
  with an optional best-effort exporter sink.
- **`policy` + `delegate`** — a default-deny inter-agent call matrix from each
  manifest's `mayCall`, enforced fail-closed on a real delegation path with audit.
- An end-to-end example and 22 `bun:test` cases across the suite.

[0.1.0]: https://github.com/Moai-Team-LLC/AgenticOps/releases/tag/v0.1.0
