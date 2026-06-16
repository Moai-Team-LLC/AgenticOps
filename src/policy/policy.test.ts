import { test, expect } from "bun:test";
import { AgentManifest } from "../manifest/schema";
import { CallPolicy } from "./policy";

function manifest(name: string, mayCall: string[]): AgentManifest {
  return AgentManifest.parse({
    name,
    runtime: "claude-code",
    model: "claude-opus-4-8",
    instructionsPath: `./agents/${name}/CLAUDE.md`,
    limits: { maxTurns: 5, timeoutMs: 5000 },
    mayCall,
  });
}

test("default deny: a call is allowed only if explicitly listed", () => {
  const policy = new CallPolicy([manifest("scout", ["sage"]), manifest("sage", [])]);

  expect(policy.canCall("scout", "sage")).toBe(true);
  expect(policy.canCall("sage", "scout")).toBe(false); // not listed
  expect(policy.canCall("scout", "scribe")).toBe(false); // unknown callee
  expect(policy.canCall("ghost", "sage")).toBe(false); // unknown caller
});

test("assertCanCall throws on a denied call", () => {
  const policy = new CallPolicy([manifest("scout", ["sage"])]);
  expect(() => policy.assertCanCall("scout", "sage")).not.toThrow();
  expect(() => policy.assertCanCall("sage", "scout")).toThrow(/call denied/);
});
