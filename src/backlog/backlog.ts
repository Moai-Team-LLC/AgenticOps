import { Database } from "bun:sqlite";

/** A unit of deferred work for an agent, persisted so it survives restarts. */
export type BacklogTask = {
  id: number;
  agent: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

export type EnqueueOptions = { maxAttempts?: number };
export type ClaimOptions = { leaseMs?: number; now?: number };
export type BacklogStats = { pending: number; leased: number; failed: number };

type Row = {
  id: number;
  agent: string;
  payload: string;
  attempts: number;
  maxAttempts: number;
};

/**
 * Durable FIFO backlog — overflow / deferred work that survives a restart.
 *
 * Backed by SQLite (bun:sqlite, zero external deps). A claimed task is leased
 * for a bounded window; if the worker dies, the lease expires and the task
 * becomes re-claimable, so no work is silently lost. Failed attempts retry up
 * to `maxAttempts`, then park as `failed` for inspection.
 *
 * Maps to SCORECARD.md -> "Fleet operations" (M2, durable-backlog gate).
 */
export class Backlog {
  private readonly db: Database;

  constructor(path = "agenticops-backlog.sqlite") {
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        agent        TEXT    NOT NULL,
        payload      TEXT    NOT NULL,
        status       TEXT    NOT NULL DEFAULT 'pending',
        attempts     INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        lease_until  INTEGER NOT NULL DEFAULT 0,
        created_at   INTEGER NOT NULL,
        updated_at   INTEGER NOT NULL
      );
    `);
  }

  /** Append a task to the queue. Returns its id. */
  enqueue(agent: string, payload: unknown, opts: EnqueueOptions = {}): number {
    const now = Date.now();
    const info = this.db
      .query(
        `INSERT INTO tasks (agent, payload, max_attempts, created_at, updated_at)
         VALUES ($agent, $payload, $max, $now, $now)`,
      )
      .run({
        $agent: agent,
        $payload: JSON.stringify(payload ?? null),
        $max: opts.maxAttempts ?? 3,
        $now: now,
      });
    return Number(info.lastInsertRowid);
  }

  /**
   * Atomically claim the oldest available task — `pending`, or `leased` with an
   * expired lease — incrementing its attempt count and re-leasing it. Returns
   * null when nothing is claimable.
   */
  claim(opts: ClaimOptions = {}): BacklogTask | null {
    const leaseMs = opts.leaseMs ?? 30_000;
    const now = opts.now ?? Date.now();
    const claimTx = this.db.transaction((): BacklogTask | null => {
      const row = this.db
        .query(
          `SELECT id, agent, payload, attempts, max_attempts AS maxAttempts
           FROM tasks
           WHERE status = 'pending'
              OR (status = 'leased' AND lease_until <= $now)
           ORDER BY id
           LIMIT 1`,
        )
        .get({ $now: now }) as Row | null;
      if (!row) return null;
      this.db
        .query(
          `UPDATE tasks
           SET status = 'leased', attempts = attempts + 1, lease_until = $lease, updated_at = $now
           WHERE id = $id`,
        )
        .run({ $lease: now + leaseMs, $now: now, $id: row.id });
      return {
        id: row.id,
        agent: row.agent,
        payload: JSON.parse(row.payload) as unknown,
        attempts: row.attempts + 1,
        maxAttempts: row.maxAttempts,
      };
    });
    return claimTx();
  }

  /** Mark a claimed task done and remove it from the queue. */
  complete(id: number): void {
    this.db.query(`DELETE FROM tasks WHERE id = $id`).run({ $id: id });
  }

  /**
   * Report a failed attempt. Re-queues for retry until `max_attempts` is
   * reached, after which the task is parked as `failed`.
   */
  fail(id: number): void {
    this.db
      .query(
        `UPDATE tasks
         SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'pending' END,
             lease_until = 0,
             updated_at = $now
         WHERE id = $id`,
      )
      .run({ $now: Date.now(), $id: id });
  }

  /** Count tasks by lifecycle state. */
  stats(): BacklogStats {
    const rows = this.db
      .query(`SELECT status, COUNT(*) AS n FROM tasks GROUP BY status`)
      .all() as { status: string; n: number }[];
    const stats: BacklogStats = { pending: 0, leased: 0, failed: 0 };
    for (const { status, n } of rows) {
      if (status === "pending") stats.pending = n;
      else if (status === "leased") stats.leased = n;
      else if (status === "failed") stats.failed = n;
    }
    return stats;
  }

  close(): void {
    this.db.close();
  }
}
