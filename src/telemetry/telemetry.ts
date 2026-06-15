import { Database } from "bun:sqlite";

export type AuditKind = "lifecycle" | "auth" | "tool";

/** An immutable record of something that happened in the fleet. */
export type AuditEvent = {
  id: number;
  at: number;
  agent: string;
  kind: AuditKind;
  action: string;
  detail: unknown;
};

export type AuditInput = { agent: string; kind: AuditKind; action: string; detail?: unknown };

export type HealthStatus = "ok" | "degraded" | "down";

export type AgentHealth = {
  agent: string;
  status: HealthStatus;
  lastSeen: number;
  /** True when the agent has not been seen within `staleAfterMs`. */
  stale: boolean;
};

export type TelemetryOptions = { staleAfterMs?: number };

type AuditRow = { id: number; at: number; agent: string; kind: string; action: string; detail: string };
type HealthRow = { agent: string; status: string; lastSeen: number };

/**
 * Fleet observability — an append-only operational audit plus per-agent
 * health/heartbeat, on top of the per-run traces of Layer 6. Backed by SQLite
 * (bun:sqlite). The audit exposes no update/delete API by design; field names
 * (agent / action / detail) stay OTel-GenAI friendly. A streaming OTel exporter
 * is a deliberate follow-up.
 *
 * Maps to SCORECARD.md -> "Fleet operations" (M3, fleet-observability gate).
 */
export class Telemetry {
  private readonly db: Database;
  private readonly staleAfterMs: number;

  constructor(path = "agenticops-telemetry.sqlite", opts: TelemetryOptions = {}) {
    this.staleAfterMs = opts.staleAfterMs ?? 90_000;
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        at     INTEGER NOT NULL,
        agent  TEXT    NOT NULL,
        kind   TEXT    NOT NULL,
        action TEXT    NOT NULL,
        detail TEXT    NOT NULL DEFAULT 'null'
      );
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS audit_agent_at ON audit (agent, at);`);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS health (
        agent     TEXT PRIMARY KEY,
        status    TEXT NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `);
  }

  /** Append an immutable audit event. Returns its id. */
  audit(ev: AuditInput, now = Date.now()): number {
    const info = this.db
      .query(
        `INSERT INTO audit (at, agent, kind, action, detail)
         VALUES ($at, $agent, $kind, $action, $detail)`,
      )
      .run({
        $at: now,
        $agent: ev.agent,
        $kind: ev.kind,
        $action: ev.action,
        $detail: JSON.stringify(ev.detail ?? null),
      });
    return Number(info.lastInsertRowid);
  }

  /** Most-recent audit events, newest first; optionally filtered by agent. */
  recent(opts: { agent?: string; limit?: number } = {}): AuditEvent[] {
    const limit = opts.limit ?? 100;
    const rows = (
      opts.agent === undefined
        ? this.db
            .query(
              `SELECT id, at, agent, kind, action, detail FROM audit
               ORDER BY id DESC LIMIT $limit`,
            )
            .all({ $limit: limit })
        : this.db
            .query(
              `SELECT id, at, agent, kind, action, detail FROM audit
               WHERE agent = $agent ORDER BY id DESC LIMIT $limit`,
            )
            .all({ $agent: opts.agent, $limit: limit })
    ) as AuditRow[];
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      agent: r.agent,
      kind: r.kind as AuditKind,
      action: r.action,
      detail: JSON.parse(r.detail) as unknown,
    }));
  }

  /** Record a heartbeat for an agent (status defaults to "ok"). */
  heartbeat(agent: string, status: HealthStatus = "ok", now = Date.now()): void {
    this.db
      .query(
        `INSERT INTO health (agent, status, last_seen) VALUES ($agent, $status, $now)
         ON CONFLICT(agent) DO UPDATE SET status = excluded.status, last_seen = excluded.last_seen`,
      )
      .run({ $agent: agent, $status: status, $now: now });
  }

  /**
   * Per-agent health. An agent unseen for longer than `staleAfterMs` is flagged
   * stale and reported as "down" regardless of its last self-reported status.
   */
  health(now = Date.now()): AgentHealth[] {
    const rows = this.db
      .query(`SELECT agent, status, last_seen AS lastSeen FROM health ORDER BY agent`)
      .all() as HealthRow[];
    return rows.map((r) => {
      const stale = now - r.lastSeen > this.staleAfterMs;
      return {
        agent: r.agent,
        status: stale ? "down" : (r.status as HealthStatus),
        lastSeen: r.lastSeen,
        stale,
      };
    });
  }

  close(): void {
    this.db.close();
  }
}
