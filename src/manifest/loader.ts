import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { AgentManifest } from "./schema";

const ENV_REF = /\$\{([A-Z0-9_]+)\}/g;

/** Interpolate ${VAR} references in a string against the host environment. */
function interpolate(value: string, env: Record<string, string | undefined>): string {
  return value.replace(ENV_REF, (_match, key: string) => {
    const resolved = env[key];
    if (resolved === undefined) {
      throw new Error(`manifest env interpolation failed: \${${key}} is not set`);
    }
    return resolved;
  });
}

/**
 * Load, env-interpolate, and validate an agent manifest from a YAML file.
 * Creds enter here at run time — they never live in the manifest or the repo.
 */
export function loadManifest(
  path: string,
  env: Record<string, string | undefined> = process.env,
): AgentManifest {
  const parsed = AgentManifest.parse(parse(readFileSync(path, "utf8")) as unknown);
  const resolvedEnv = Object.fromEntries(
    Object.entries(parsed.env).map(([key, value]) => [key, interpolate(value, env)]),
  );
  return { ...parsed, env: resolvedEnv };
}
