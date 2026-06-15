import { z } from "zod";

/**
 * AgentManifest — an agent as a versioned, deployable artifact.
 *
 * The runtime counterpart to the Agentic Product Standard's "Agent Contract"
 * (a design spec). The manifest is what the fleet actually deploys and
 * schedules: limits, runtime, schedule, env. The same manifest runs in dev and
 * prod; agent-logic (`instructionsPath`) stays split from the platform prompt
 * (`platformPromptPath`) injected at run time.
 *
 * Maps to SCORECARD.md -> "Fleet operations" (M2, runtime-manifest gate).
 */
export const ResourceLimits = z.object({
  /** Hard ceiling on agent-loop turns; the runner aborts past this. */
  maxTurns: z.number().int().positive(),
  /** Wall-clock timeout for a single run, in milliseconds. */
  timeoutMs: z.number().int().positive(),
  /** Optional container resource hints. */
  cpu: z.number().positive().optional(),
  memoryMb: z.number().int().positive().optional(),
});

export const Schedule = z.object({
  /** 5-field cron expression. The fleet scheduler fires it once across replicas. */
  cron: z.string(),
  /** IANA timezone, e.g. "Europe/Nicosia". */
  timezone: z.string().default("UTC"),
});

export const AgentManifest = z.object({
  /** Stable identifier, kebab-case. */
  name: z.string().regex(/^[a-z][a-z0-9-]*$/),
  displayName: z.string().optional(),

  /** Execution runtime. Extend the enum as new runtimes are supported. */
  runtime: z.enum(["claude-code", "gemini-cli"]),
  model: z.string(),

  /** Path to agent-logic instructions (e.g. CLAUDE.md). */
  instructionsPath: z.string(),
  /** Optional platform/runtime prompt injected at run time — kept SEPARATE from agent-logic. */
  platformPromptPath: z.string().optional(),

  limits: ResourceLimits,
  schedule: Schedule.optional(),

  /** Allow-listed tools (Standard Layer 2 / permissions-in-code). */
  tools: z.array(z.string()).default([]),

  /**
   * Fleet inter-agent permission: the agents THIS agent may call.
   * Empty = calls no one (default deny). Maps to "Fleet operations" (M3).
   */
  mayCall: z.array(z.string()).default([]),

  /** Env vars resolved at load time via ${VAR} interpolation from the host env. */
  env: z.record(z.string()).default({}),
});

export type AgentManifest = z.infer<typeof AgentManifest>;
