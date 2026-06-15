import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backlog } from "./backlog";

let counter = 0;
function freshPath(): string {
  counter += 1;
  return join(tmpdir(), `agenticops-backlog-${process.pid}-${counter}.sqlite`);
}

test("enqueue/claim is FIFO and complete removes the task", () => {
  const b = new Backlog(freshPath());
  b.enqueue("scout", { topic: "a" });
  b.enqueue("scout", { topic: "b" });

  const first = b.claim();
  expect(first?.payload).toEqual({ topic: "a" });
  b.complete(first!.id);

  const second = b.claim();
  expect(second?.payload).toEqual({ topic: "b" });
  expect(b.claim()).toBeNull(); // 'b' is leased (not expired), nothing else pending
  b.close();
});

test("fail retries until max_attempts, then parks as failed", () => {
  const b = new Backlog(freshPath());
  const id = b.enqueue("scout", 1, { maxAttempts: 2 });

  const t1 = b.claim();
  expect(t1?.id).toBe(id);
  expect(t1?.attempts).toBe(1);
  b.fail(t1!.id); // attempts 1 < 2 -> back to pending

  const t2 = b.claim();
  expect(t2?.attempts).toBe(2);
  b.fail(t2!.id); // attempts 2 >= 2 -> failed

  expect(b.claim()).toBeNull();
  expect(b.stats().failed).toBe(1);
  b.close();
});

test("an expired lease makes a task re-claimable", () => {
  const b = new Backlog(freshPath());
  b.enqueue("scout", 1);

  const t = b.claim({ leaseMs: 1000, now: 1000 }); // lease_until = 2000
  expect(t).not.toBeNull();
  expect(b.claim({ now: 1500 })).toBeNull(); // still leased

  const again = b.claim({ now: 3000 }); // lease expired
  expect(again?.id).toBe(t!.id);
  expect(again?.attempts).toBe(2);
  b.close();
});

test("tasks survive a restart (reopen on the same file)", () => {
  const path = freshPath();
  const b1 = new Backlog(path);
  b1.enqueue("scout", { k: 1 });
  b1.close();

  const b2 = new Backlog(path);
  const t = b2.claim();
  expect(t?.payload).toEqual({ k: 1 });
  b2.close();
});
