import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Telemetry } from "./telemetry";

let counter = 0;
function freshPath(): string {
  counter += 1;
  return join(tmpdir(), `agenticops-telemetry-${process.pid}-${counter}.sqlite`);
}

test("audit appends and recent() is newest-first and filterable", () => {
  const t = new Telemetry(freshPath());
  t.audit({ agent: "scout", kind: "lifecycle", action: "started" }, 1000);
  t.audit({ agent: "scout", kind: "tool", action: "web-search", detail: { q: "x" } }, 2000);
  t.audit({ agent: "sage", kind: "auth", action: "token-minted" }, 3000);

  const all = t.recent();
  expect(all.length).toBe(3);
  expect(all[0]?.agent).toBe("sage"); // newest first
  expect(all[0]?.at).toBe(3000);

  const scoutOnly = t.recent({ agent: "scout" });
  expect(scoutOnly.length).toBe(2);
  expect(scoutOnly[0]?.action).toBe("web-search");
  expect((scoutOnly[0]?.detail as { q: string }).q).toBe("x");
  t.close();
});

test("health flags agents unseen past the staleness window as down", () => {
  const t = new Telemetry(freshPath(), { staleAfterMs: 1000 });
  t.heartbeat("scout", "ok", 10_000);
  t.heartbeat("sage", "degraded", 10_000);

  const fresh = t.health(10_500);
  expect(fresh.find((h) => h.agent === "scout")?.status).toBe("ok");
  expect(fresh.find((h) => h.agent === "scout")?.stale).toBe(false);
  expect(fresh.find((h) => h.agent === "sage")?.status).toBe("degraded");

  const later = t.health(12_000); // >1s since last heartbeat
  expect(later.find((h) => h.agent === "scout")?.stale).toBe(true);
  expect(later.find((h) => h.agent === "scout")?.status).toBe("down");
  t.close();
});

test("audit survives a restart", () => {
  const path = freshPath();
  const a = new Telemetry(path);
  a.audit({ agent: "scout", kind: "lifecycle", action: "started" }, 1000);
  a.close();

  const b = new Telemetry(path);
  expect(b.recent().length).toBe(1);
  b.close();
});

test("the optional sink receives each event and a throwing sink is contained", () => {
  const seen: string[] = [];
  const t = new Telemetry(":memory:", { sink: (e) => seen.push(`${e.agent}/${e.action}`) });
  const id = t.audit({ agent: "scout", kind: "lifecycle", action: "started" }, 1000);
  expect(id).toBeGreaterThan(0);
  expect(seen).toEqual(["scout/started"]);

  const t2 = new Telemetry(":memory:", {
    sink: () => {
      throw new Error("exporter down");
    },
  });
  expect(() => t2.audit({ agent: "scout", kind: "tool", action: "x" })).not.toThrow();
  expect(t2.recent().length).toBe(1); // durable record intact despite the failing sink
  t.close();
  t2.close();
});
