import type { AgentManifest } from "../manifest/schema";

/**
 * Inter-agent call policy — an explicit "who may call whom" matrix built from
 * each manifest's `mayCall` list. Default deny: a call is allowed only if the
 * caller explicitly lists the callee.
 *
 * Maps to SCORECARD.md -> "Fleet operations" (M3, inter-agent call matrix).
 */
export class CallPolicy {
  private readonly allow: Map<string, Set<string>>;

  constructor(manifests: AgentManifest[]) {
    this.allow = new Map();
    for (const m of manifests) this.allow.set(m.name, new Set(m.mayCall));
  }

  /** Whether `caller` is permitted to call `callee`. */
  canCall(caller: string, callee: string): boolean {
    return this.allow.get(caller)?.has(callee) ?? false;
  }

  /** Throw unless `caller` is permitted to call `callee`. */
  assertCanCall(caller: string, callee: string): void {
    if (!this.canCall(caller, callee)) {
      throw new Error(`call denied: "${caller}" may not call "${callee}"`);
    }
  }
}
