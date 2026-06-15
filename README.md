# AgenticOps

**Runtime & fleet operations for agentic products.** The reference implementation
of the *Fleet operations* surface of the
[Agentic Product Standard](https://github.com/Moai-Team-LLC/agentic-product-standard).

> Part of the Moai Team agentic stack:
> **Standard** (the contract) → **[AgenticMind](https://github.com/Moai-Team-LLC/AgenticMind)**
> (the knowledge / judgment layer) → **AgenticOps** (the runtime / ops layer).

## Why

The Standard tells you how to build *one correct agent or system* — durable
execution, observability, cost, security. It stops at the boundary of **running
many long-lived agents as deployed infrastructure**. That Day-2 surface is what
AgenticOps implements:

- **Agent = deployable manifest** — a versioned artifact (limits, runtime,
  schedule, env), distinct from the design-time Agent Contract; the same manifest
  runs dev↔prod; agent-logic stays split from the platform prompt.
- **Bounded runner** — every run has an explicit max-turns ceiling, a wall-clock
  timeout, and graceful cancellation. No unbounded loops.
- **Coordinated scheduling** — fleet cron with a lock (fire-once across replicas)
  and misfire handling (fires missed while down are coalesced).
- **Durable backlog** — overflow / deferred work survives restarts.
- **Fleet observability** *(planned)* — per-agent health + an append-only ops
  audit, layered on per-run traces.

Lean over platform: a runner is a function with limits, not a microservice, until
a real fleet exists.

## Status — walking skeleton

| Module | Maps to SCORECARD *Fleet operations* | State |
|---|---|---|
| `src/manifest` | runtime manifest (M2) | ✅ schema + loader |
| `src/runner` | bounded execution (M2) | ✅ skeleton |
| `src/scheduler` | coordinated scheduling + misfire (M2) | ✅ cron + fire-once + coalesce |
| `src/backlog` | durable backlog (M2) | ✅ SQLite (bun:sqlite) |
| telemetry | fleet observability (M3) | ⬜ planned |

## Quick look

```ts
import { loadManifest, runAgent } from "agenticops";

const manifest = loadManifest("./examples/agent.example.yaml");

const outcome = await runAgent(manifest, async ({ turn, signal }) => {
  // call your runtime (Claude Agent SDK / Claude Code / Gemini) here;
  // honour `signal` so timeout / cancellation can interrupt the turn.
  return { done: turn >= 1 };
});
// outcome.status: "completed" | "max-turns" | "timeout" | "cancelled" | "error"
```

## License

Apache-2.0 © Moai Team LLC.
