/**
 * Minimal, dependency-free cron evaluator (standard 5-field, UTC).
 *
 * Supports `*`, lists (`a,b`), ranges (`a-b`), and steps (`* /n`, `a-b/n`) in
 * the minute, hour, day-of-month, month, and day-of-week fields. Day-of-week
 * accepts 0-7 (0 and 7 = Sunday). Uses the standard cron OR rule when both
 * day-of-month and day-of-week are restricted.
 *
 * Timezone-aware evaluation is a deliberate follow-up — v1 evaluates in UTC.
 */
export type ParsedCron = {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  domRestricted: boolean;
  dowRestricted: boolean;
};

function parseField(spec: string, min: number, max: number, label: string): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw === undefined ? 1 : Number(stepRaw);
    if (!Number.isInteger(step) || step < 1) {
      throw new Error(`cron: bad step in ${label}: "${part}"`);
    }
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
    } else if (range !== undefined && range.includes("-")) {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      lo = Number(range);
      hi = lo;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      throw new Error(`cron: bad range in ${label}: "${part}"`);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`cron: expected 5 fields, got ${fields.length}: "${expr}"`);
  }
  const [mi, ho, dom, mo, dow] = fields as [string, string, string, string, string];
  const dayOfWeek = new Set<number>();
  for (const v of parseField(dow, 0, 7, "day-of-week")) dayOfWeek.add(v === 7 ? 0 : v);
  return {
    minute: parseField(mi, 0, 59, "minute"),
    hour: parseField(ho, 0, 23, "hour"),
    dayOfMonth: parseField(dom, 1, 31, "day-of-month"),
    month: parseField(mo, 1, 12, "month"),
    dayOfWeek,
    domRestricted: dom !== "*",
    dowRestricted: dow !== "*",
  };
}

/** Whether `date` (evaluated in UTC) matches the parsed cron. */
export function cronMatches(cron: ParsedCron, date: Date): boolean {
  if (!cron.minute.has(date.getUTCMinutes())) return false;
  if (!cron.hour.has(date.getUTCHours())) return false;
  if (!cron.month.has(date.getUTCMonth() + 1)) return false;
  const domOk = cron.dayOfMonth.has(date.getUTCDate());
  const dowOk = cron.dayOfWeek.has(date.getUTCDay());
  return cron.domRestricted && cron.dowRestricted ? domOk || dowOk : domOk && dowOk;
}

const MINUTE = 60_000;
const DEFAULT_LIMIT_MS = 366 * 24 * 60 * MINUTE;

/** The next fire strictly after `after`, or null if none within `limitMs`. */
export function nextFireAfter(
  expr: string | ParsedCron,
  after: Date,
  limitMs = DEFAULT_LIMIT_MS,
): Date | null {
  const cron = typeof expr === "string" ? parseCron(expr) : expr;
  const startMs = Math.floor(after.getTime() / MINUTE) * MINUTE + MINUTE; // next whole minute
  const limit = after.getTime() + limitMs;
  for (let t = startMs; t <= limit; t += MINUTE) {
    if (cronMatches(cron, new Date(t))) return new Date(t);
  }
  return null;
}

/** All fire epochs in the half-open window (afterMs, untilMs]. */
export function fireTimesBetween(expr: string, afterMs: number, untilMs: number): number[] {
  const cron = parseCron(expr);
  const out: number[] = [];
  let cursor = afterMs;
  while (out.length < 100_000) {
    const next = nextFireAfter(cron, new Date(cursor), untilMs - cursor + MINUTE);
    if (next === null || next.getTime() > untilMs) break;
    out.push(next.getTime());
    cursor = next.getTime();
  }
  return out;
}
