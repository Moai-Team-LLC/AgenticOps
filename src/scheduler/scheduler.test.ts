import { test, expect } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Backlog } from "../backlog/backlog";
import { Scheduler } from "./scheduler";

let counter = 0;
function freshPath(): string {
  counter += 1;
  return join(tmpdir(), `agenticops-sched-${process.pid}-${counter}.sqlite`);
}

const T0 = Date.UTC(2026, 0, 1, 0, 0, 0); // a whole-minute epoch

test("a tick enqueues one task when a fire occurred", () => {
  const backlog = new Backlog(freshPath());
  const sched = new Scheduler(backlog, freshPath());
  sched.register("ticker", "* * * * *", "scout", { x: 1 }, T0);

  const [res] = sched.tick(T0 + 60_000);
  expect(res?.enqueued).toBe(true);
  expect(backlog.stats().pending).toBe(1);

  const task = backlog.claim();
  expect(task?.agent).toBe("scout");
  expect((task?.payload as { data: unknown }).data).toEqual({ x: 1 });
  backlog.close();
  sched.close();
});

test("missed fires while down are coalesced to a single enqueue", () => {
  const backlog = new Backlog(freshPath());
  const sched = new Scheduler(backlog, freshPath());
  sched.register("ticker", "* * * * *", "scout", null, T0);

  const [res] = sched.tick(T0 + 5 * 60_000); // down for 5 minutes
  expect(res?.missed).toBe(5);
  expect(res?.enqueued).toBe(true);
  expect(backlog.stats().pending).toBe(1); // coalesced, not 5

  const task = backlog.claim();
  expect((task?.payload as { missed: number }).missed).toBe(5);
  backlog.close();
  sched.close();
});

test("fire-once across replicas: only one enqueues for the same fire-time", () => {
  const backlog = new Backlog(freshPath());
  const schedPath = freshPath();
  const a = new Scheduler(backlog, schedPath);
  const b = new Scheduler(backlog, schedPath); // second replica, shared ledger

  a.register("job", "* * * * *", "scout", null, T0);
  const ra = a.tick(T0 + 60_000); // replica A claims and enqueues
  b.register("job", "* * * * *", "scout", null, T0); // re-arm B to the same window
  const rb = b.tick(T0 + 60_000); // replica B sees the window but the fire is taken

  expect(ra[0]?.enqueued).toBe(true);
  expect(rb[0]?.enqueued).toBe(false);
  expect(backlog.stats().pending).toBe(1);
  backlog.close();
  a.close();
  b.close();
});

test("register validates the cron expression", () => {
  const backlog = new Backlog(freshPath());
  const sched = new Scheduler(backlog, freshPath());
  expect(() => sched.register("bad", "not a cron", "scout")).toThrow();
  backlog.close();
  sched.close();
});
