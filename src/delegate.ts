import type { Backlog } from "./backlog/backlog";
import type { CallPolicy } from "./policy/policy";
import type { Telemetry } from "./telemetry/telemetry";

export type DelegateDeps = {
  policy: CallPolicy;
  backlog: Backlog;
  telemetry?: Telemetry;
};

/**
 * Enforced inter-agent delegation — `caller` asks `callee` to do work.
 *
 * The call matrix is enforced (default deny) BEFORE anything is enqueued, so a
 * denied call is fail-closed (throws) and never reaches the backlog. Both the
 * grant and the denial are recorded in the audit log. On allow, the work is
 * appended to the durable backlog for `callee` and the new task id returned.
 *
 * Wires CallPolicy (M3 inter-agent matrix) into a real path with Backlog and
 * Telemetry.
 */
export function delegate(deps: DelegateDeps, caller: string, callee: string, payload: unknown): number {
  const { policy, backlog, telemetry } = deps;
  if (!policy.canCall(caller, callee)) {
    telemetry?.audit({ agent: caller, kind: "auth", action: "delegate.denied", detail: { callee } });
    throw new Error(`call denied: "${caller}" may not call "${callee}"`);
  }
  const taskId = backlog.enqueue(callee, { from: caller, payload });
  telemetry?.audit({ agent: caller, kind: "lifecycle", action: "delegate.enqueued", detail: { callee, taskId } });
  return taskId;
}
