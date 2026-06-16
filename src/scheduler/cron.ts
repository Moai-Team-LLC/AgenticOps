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

type Fields = { minute: number; hour: number; day: number; month: number; weekday: number };

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Wall-clock fields for `date` in the given IANA timezone (UTC if omitted). */
function fieldsOf(date: Date, timeZone?: string): Fields {
  if (timeZone === undefined) {
    return {
      minute: date.getUTCMinutes(),
      hour: date.getUTCHours(),
      day: date.getUTCDate(),
      month: date.getUTCMonth() + 1,
      weekday: date.getUTCDay(),
    };
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "short",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  }).formatToParts(date);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return {
    minute: Number(get("minute")),
    hour: Number(get("hour")) % 24, // some engines render midnight as "24"
    day: Number(get("day")),
    month: Number(get("month")),
    weekday: WEEKDAY[get("weekday")] ?? 0,
  };
}

/** Whether `date` matches the parsed cron, evaluated in `timeZone` (UTC if omitted). */
export function cronMatches(cron: ParsedCron, date: Date, timeZone?: string): boolean {
  const f = fieldsOf(date, timeZone);
  if (!cron.minute.has(f.minute)) return false;
  if (!cron.hour.has(f.hour)) return false;
  if (!cron.month.has(f.month)) return false;
  const domOk = cron.dayOfMonth.has(f.day);
  const dowOk = cron.dayOfWeek.has(f.weekday);
  return cron.domRestricted && cron.dowRestricted ? domOk || dowOk : domOk && dowOk;
}

const MINUTE = 60_000;
const DEFAULT_LIMIT_MS = 366 * 24 * 60 * MINUTE;

export type NextFireOptions = { timeZone?: string; limitMs?: number };

/** The next fire strictly after `after` (evaluated in `timeZone`), or null if none within `limitMs`. */
export function nextFireAfter(
  expr: string | ParsedCron,
  after: Date,
  opts: NextFireOptions = {},
): Date | null {
  const { timeZone, limitMs = DEFAULT_LIMIT_MS } = opts;
  const cron = typeof expr === "string" ? parseCron(expr) : expr;
  const startMs = Math.floor(after.getTime() / MINUTE) * MINUTE + MINUTE; // next whole minute
  const limit = after.getTime() + limitMs;
  for (let t = startMs; t <= limit; t += MINUTE) {
    if (cronMatches(cron, new Date(t), timeZone)) return new Date(t);
  }
  return null;
}

/** All fire epochs in the half-open window (afterMs, untilMs], evaluated in `timeZone`. */
export function fireTimesBetween(
  expr: string,
  afterMs: number,
  untilMs: number,
  timeZone?: string,
): number[] {
  const cron = parseCron(expr);
  const out: number[] = [];
  let cursor = afterMs;
  while (out.length < 100_000) {
    const next = nextFireAfter(cron, new Date(cursor), { timeZone, limitMs: untilMs - cursor + MINUTE });
    if (next === null || next.getTime() > untilMs) break;
    out.push(next.getTime());
    cursor = next.getTime();
  }
  return out;
}
