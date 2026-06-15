import { test, expect } from "bun:test";
import { parseCron, cronMatches, nextFireAfter, fireTimesBetween } from "./cron";

test("parseCron rejects malformed expressions", () => {
  expect(() => parseCron("* * * *")).toThrow(); // 4 fields
  expect(() => parseCron("60 * * * *")).toThrow(); // minute out of range
  expect(() => parseCron("* 24 * * *")).toThrow(); // hour out of range
  expect(() => parseCron("*/0 * * * *")).toThrow(); // bad step
});

test("cronMatches honours each field (UTC)", () => {
  const every15 = parseCron("*/15 * * * *");
  expect(cronMatches(every15, new Date(Date.UTC(2026, 0, 1, 9, 15)))).toBe(true);
  expect(cronMatches(every15, new Date(Date.UTC(2026, 0, 1, 9, 16)))).toBe(false);

  // 2024-01-01 is a Monday (getUTCDay() === 1)
  const monday9 = parseCron("0 9 * * 1");
  expect(cronMatches(monday9, new Date(Date.UTC(2024, 0, 1, 9, 0)))).toBe(true);
  expect(cronMatches(monday9, new Date(Date.UTC(2024, 0, 2, 9, 0)))).toBe(false); // Tuesday
});

test("nextFireAfter finds the next occurrence", () => {
  const after = new Date(Date.UTC(2026, 0, 1, 9, 7));
  const next = nextFireAfter("*/15 * * * *", after);
  expect(next?.toISOString()).toBe("2026-01-01T09:15:00.000Z");
});

test("fireTimesBetween enumerates a window (exclusive start, inclusive end)", () => {
  const start = Date.UTC(2026, 0, 1, 0, 0);
  const end = Date.UTC(2026, 0, 1, 0, 3);
  expect(fireTimesBetween("* * * * *", start, end)).toEqual([
    Date.UTC(2026, 0, 1, 0, 1),
    Date.UTC(2026, 0, 1, 0, 2),
    Date.UTC(2026, 0, 1, 0, 3),
  ]);
});
