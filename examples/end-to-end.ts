/**
 * End-to-end demo: the AgenticOps layer wired together.
 *
 *   schedule  ->  durable backlog  ->  bounded run  ->  audit + health
 *
 * Run with:  bun examples/end-to-end.ts
 *
 * Uses in-memory SQLite and explicit timestamps, so it is self-contained and
 * deterministic — no files, no clock, no network.
 */
import {
  AgentManifest,
  Backlog,
  CallPolicy,
  runAgent,
  Scheduler,
  Telemetry,
} from "../src/index";

// 1. Agents as deployable manifests (agent-logic path kept separate from runtime).
const scout = AgentManifest.parse({
  name: "scout",
  runtime: "claude-code",
  model: "claude-opus-4-8",
  instructionsPath: "./agents/scout/CLAUDE.md",
  limits: { maxTurns: 5, timeoutMs: 5000 },
  mayCall: ["sage"],
});
const sage = AgentManifest.parse({
  name: "sage",
  runtime: "claude-code",
  model: "claude-opus-4-8",
  instructionsPath: "./agents/sage/CLAUDE.md",
  limits: { maxTurns: 5, timeoutMs: 5000 },
});

// 2. Inter-agent call matrix (default deny).
const policy = new CallPolicy([scout, sage]);
console.log("scout -> sage allowed:", policy.canCall("scout", "sage")); // true
console.log("sage  -> scout allowed:", policy.canCall("sage", "scout")); // false

// 3. Fleet infra.
const backlog = new Backlog(":memory:");
const scheduler = new Scheduler(backlog, ":memory:");
const telemetry = new Telemetry(":memory:");

// 4. Arm a schedule and tick the fleet (explicit timestamps for determinism).
const t0 = Date.UTC(2026, 0, 1, 0, 0, 0);
scheduler.register(scout.name, "* * * * *", scout.name, { goal: "weekly scan" }, "UTC", t0);
console.log("tick:", scheduler.tick(t0 + 60_000));

// 5. A worker claims the scheduled task and runs it under bounded execution.
const task = backlog.claim();
if (task) {
  telemetry.audit({ agent: task.agent, kind: "lifecycle", action: "run.started", detail: task.payload });
  telemetry.heartbeat(task.agent, "ok");

  const outcome = await runAgent(scout, async ({ turn }) => {
    telemetry.audit({ agent: scout.name, kind: "tool", action: "web-search", detail: { turn } });
    return { done: true }; // a real runtime would loop until the goal is met
  });

  telemetry.audit({ agent: task.agent, kind: "lifecycle", action: `run.${outcome.status}`, detail: { turns: outcome.turns } });
  if (outcome.status === "completed") backlog.complete(task.id);
  console.log("run outcome:", outcome);
}

// 6. Observe the fleet.
console.log("backlog:", backlog.stats());
console.log("health:", telemetry.health());
console.log("audit:", telemetry.recent().map((e) => `${e.agent} ${e.kind}/${e.action}`));

backlog.close();
scheduler.close();
telemetry.close();
