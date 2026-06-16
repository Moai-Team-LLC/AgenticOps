import { test, expect } from "bun:test";
import { AgentManifest } from "./manifest/schema";
import { CallPolicy } from "./policy/policy";
import { Backlog } from "./backlog/backlog";
import { Telemetry } from "./telemetry/telemetry";
import { delegate } from "./delegate";

function mf(name: string, mayCall: string[]): AgentManifest {
  return AgentManifest.parse({
    name,
    runtime: "claude-code",
    model: "claude-opus-4-8",
    instructionsPath: `./agents/${name}/CLAUDE.md`,
    limits: { maxTurns: 5, timeoutMs: 5000 },
    mayCall,
  });
}

test("an allowed delegation enqueues for the callee and audits the grant", () => {
  const policy = new CallPolicy([mf("scout", ["sage"]), mf("sage", [])]);
  const backlog = new Backlog(":memory:");
  const telemetry = new Telemetry(":memory:");

  const id = delegate({ policy, backlog, telemetry }, "scout", "sage", { task: "summarize" });
  expect(id).toBeGreaterThan(0);

  const t = backlog.claim();
  expect(t?.agent).toBe("sage");
  expect((t?.payload as { from: string }).from).toBe("scout");
  expect(telemetry.recent()[0]?.action).toBe("delegate.enqueued");
  backlog.close();
  telemetry.close();
});

test("a denied delegation throws, enqueues nothing, and audits the denial", () => {
  const policy = new CallPolicy([mf("scout", ["sage"]), mf("sage", [])]);
  const backlog = new Backlog(":memory:");
  const telemetry = new Telemetry(":memory:");

  expect(() => delegate({ policy, backlog, telemetry }, "sage", "scout", {})).toThrow(/call denied/);
  expect(backlog.stats().pending).toBe(0);
  expect(telemetry.recent()[0]?.action).toBe("delegate.denied");
  backlog.close();
  telemetry.close();
});
