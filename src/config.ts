/**
 * Startup configuration, parsed once from the environment (PRD-0001 FR9, ADR-0004).
 * The token is read here and passed to the GitHub client only; it must never be
 * logged, echoed in errors, or included in API responses (NFR1).
 */

export interface Config {
  token: string;
  owner: string;
  name: string;
}

const repoPattern = /^[^/\s]+\/[^/\s]+$/;

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const token = env.GITHUB_TOKEN;
  if (!token) {
    // Message names the problem, never the value.
    throw new Error("GITHUB_TOKEN must be set to a read-only fine-grained token");
  }
  const repo = env.SHIPCHECK_REPO;
  if (!repo || !repoPattern.test(repo)) {
    throw new Error("SHIPCHECK_REPO must be set to 'owner/name'");
  }
  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    // Unreachable while repoPattern holds, but TS needs the narrowing.
    throw new Error("SHIPCHECK_REPO must be set to 'owner/name'");
  }
  return { token, owner, name };
}
