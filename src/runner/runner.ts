import type { AgentManifest } from "../manifest/schema";

export type TurnResult = { done: boolean };

/** One iteration of the agent loop — supplied by the caller, runtime-agnostic. */
export type ExecuteTurn = (ctx: { turn: number; signal: AbortSignal }) => Promise<TurnResult>;

export type RunOutcome = {
  status: "completed" | "max-turns" | "timeout" | "cancelled" | "error";
  turns: number;
  error?: unknown;
};

/**
 * Bounded runner — enforces the Standard's Layer 5 contract at the fleet edge:
 * every run has an explicit max-turns ceiling, a wall-clock timeout, and
 * graceful cancellation. No unbounded loops, ever.
 *
 * The actual LLM/tool call is injected via `executeTurn`, which must honour the
 * provided AbortSignal so a timeout or external cancel can interrupt it.
 *
 * Maps to SCORECARD.md -> "Fleet operations" (M2, bounded-execution gate) and
 * STANDARD.md Layer 5 (Durable execution).
 */
export async function runAgent(
  manifest: AgentManifest,
  executeTurn: ExecuteTurn,
  external?: AbortSignal,
): Promise<RunOutcome> {
  const { maxTurns, timeoutMs } = manifest.limits;
  const controller = new AbortController();
  const onExternalAbort = () => controller.abort();
  external?.addEventListener("abort", onExternalAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // "timeout" vs "cancelled" is disambiguated by which signal fired.
  const abortedStatus = (): "timeout" | "cancelled" =>
    external?.aborted ? "cancelled" : "timeout";

  let turns = 0;
  try {
    while (turns < maxTurns) {
      if (controller.signal.aborted) return { status: abortedStatus(), turns };
      turns++;
      const result = await executeTurn({ turn: turns, signal: controller.signal });
      if (result.done) return { status: "completed", turns };
    }
    return { status: "max-turns", turns };
  } catch (error) {
    if (controller.signal.aborted) return { status: abortedStatus(), turns };
    return { status: "error", turns, error };
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", onExternalAbort);
  }
}
