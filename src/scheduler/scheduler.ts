import { Database } from "bun:sqlite";
import type { Backlog } from "../backlog/backlog";
import { fireTimesBetween, parseCron } from "./cron";

/** Outcome of evaluating one schedule during a tick. */
export type TickResult = { name: string; missed: number; enqueued: boolean };

type ScheduleRow = {
  name: string;
  cron: string;
  agent: string;
  payload: string;
  timezone: string;
  lastTick: number;
};

const FIRE_RETENTION_MS = 7 * 24 * 60 * 60_000;

/**
 * Coordinated fleet scheduler — turns cron schedules into backlog work.
 *
 * Two guarantees beyond single-agent durable execution:
 *  - **Fire-once across replicas.** Each (schedule, fire-time) is claimed in a
 *    `fires` ledger via INSERT OR IGNORE; only the winning replica enqueues, so
 *    N replicas ticking the same window enqueue exactly once.
 *  - **Misfire handling.** Fires missed while the fleet was down are detected
 *    and coalesced to the latest occurrence (one enqueue), with the missed
 *    count surfaced rather than silently dropped.
 *
 * Backed by SQLite (bun:sqlite); enqueues into the provided Backlog.
 * Maps to SCORECARD.md -> "Fleet operations" (M2, coordinated-scheduling gate).
 */
export class Scheduler {
  private readonly db: Database;

  constructor(
    private readonly backlog: Backlog,
    path = "agenticops-scheduler.sqlite",
  ) {
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedules (
        name      TEXT PRIMARY KEY,
        cron      TEXT NOT NULL,
        agent     TEXT NOT NULL,
        payload   TEXT NOT NULL DEFAULT 'null',
        timezone  TEXT NOT NULL DEFAULT 'UTC',
        last_tick INTEGER NOT NULL
      );
    `);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fires (
        name    TEXT NOT NULL,
        fire_at INTEGER NOT NULL,
        PRIMARY KEY (name, fire_at)
      );
    `);
  }

  /**
   * Register (or re-arm) a schedule. Counting starts from `now`, so a fresh
   * registration never backfills history. Validates the cron eagerly.
   */
  register(
    name: string,
    cron: string,
    agent: string,
    payload: unknown = null,
    timezone = "UTC",
    now = Date.now(),
  ): void {
    parseCron(cron); // throws on an invalid expression
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }); // throws on an invalid timezone
    this.db
      .query(
        `INSERT INTO schedules (name, cron, agent, payload, timezone, last_tick)
         VALUES ($name, $cron, $agent, $payload, $timezone, $now)
         ON CONFLICT(name) DO UPDATE SET
           cron = excluded.cron,
           agent = excluded.agent,
           payload = excluded.payload,
           timezone = excluded.timezone,
           last_tick = excluded.last_tick`,
      )
      .run({
        $name: name,
        $cron: cron,
        $agent: agent,
        $payload: JSON.stringify(payload ?? null),
        $timezone: timezone,
        $now: now,
      });
  }

  /**
   * Evaluate every schedule for fires in (last_tick, now], enqueueing coalesced
   * missed work into the backlog. Idempotent across replicas via the ledger.
   */
  tick(now = Date.now()): TickResult[] {
    const schedules = this.db
      .query(`SELECT name, cron, agent, payload, timezone, last_tick AS lastTick FROM schedules`)
      .all() as ScheduleRow[];

    const results: TickResult[] = [];
    for (const s of schedules) {
      const fires = fireTimesBetween(s.cron, s.lastTick, now, s.timezone);
      let enqueued = false;
      if (fires.length > 0) {
        const fireAt = fires[fires.length - 1]!; // coalesce missed fires to the latest
        const claim = this.db
          .query(`INSERT OR IGNORE INTO fires (name, fire_at) VALUES ($name, $fireAt)`)
          .run({ $name: s.name, $fireAt: fireAt });
        if (claim.changes === 1) {
          this.backlog.enqueue(s.agent, {
            scheduledFor: fireAt,
            missed: fires.length,
            data: JSON.parse(s.payload) as unknown,
          });
          enqueued = true;
        }
      }
      this.db
        .query(`UPDATE schedules SET last_tick = $now WHERE name = $name`)
        .run({ $now: now, $name: s.name });
      results.push({ name: s.name, missed: fires.length, enqueued });
    }

    this.db
      .query(`DELETE FROM fires WHERE fire_at < $cutoff`)
      .run({ $cutoff: now - FIRE_RETENTION_MS });
    return results;
  }

  close(): void {
    this.db.close();
  }
}
