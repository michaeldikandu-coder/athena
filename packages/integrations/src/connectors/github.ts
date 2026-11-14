import { AppError, findConnection, requireConnection } from '@athena/shared';
import { RestClient } from '../rest/rest-client';

/**
 * GitHub REST API client. Each user connects a token (fine-grained, with
 * Issues and Actions access) and one repository in Settings > Connections.
 */
export function createGithubClient(token: string): RestClient {
  return new RestClient({
    service: 'github',
    baseURL: 'https://api.github.com',
    bearerToken: token,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'athena-agent',
    },
    timeoutMs: 15000,
  });
}

/** Client for the current user's GitHub connection */
export function github(): RestClient {
  return createGithubClient(requireConnection('github').secrets.token);
}

/** Repository of the current user's GitHub connection, as owner/repo */
export function connectedRepo(): string | null {
  const repo = findConnection('github')?.config.repo;
  return typeof repo === 'string' ? repo : null;
}

/**
 * Resolve "owner/repo", defaulting to the connected repository. Agents may
 * only use the repository the user connected.
 */
export function resolveRepo(repo?: string): { owner: string; name: string; full: string } {
  const connected = requireConnection('github').config.repo as string | undefined;
  if (!connected) throw new AppError('The GitHub connection has no repository', { statusCode: 409 });

  const raw = repo || connected;
  const full = normalizeRepo(raw);
  if (!full) {
    throw new AppError(`Invalid repository: ${raw}. Use owner/repo or https://github.com/owner/repo`, {
      statusCode: 400,
    });
  }
  if (full.toLowerCase() !== connected.toLowerCase()) {
    throw new AppError(`Repository ${full} is not the connected repository (${connected})`, { statusCode: 403 });
  }
  const [owner, name] = full.split('/');
  return { owner, name, full };
}

const REPO_PART = /^[A-Za-z0-9_.-]+$/;

/**
 * Accept "owner/repo", "https://github.com/owner/repo(.git)" or "git@github.com:owner/repo.git"
 * and return "owner/repo", or null if the value is not a GitHub repository reference.
 */
export function normalizeRepo(value: string): string | null {
  const trimmed = value
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com[/:]/i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '');
  const parts = trimmed.split('/');
  if (parts.length !== 2 || !REPO_PART.test(parts[0]) || !REPO_PART.test(parts[1])) return null;
  return `${parts[0]}/${parts[1]}`;
}

export function isGithubConfigured(): boolean {
  const connection = findConnection('github');
  return Boolean(connection?.secrets.token && connection.config.repo);
}

/**
 * Confirm the token can read the repository. Returns the canonical name and
 * whether the token can push (needed to re-run jobs and manage issues).
 */
export async function verifyGithubAccess(
  token: string,
  repo: string
): Promise<{ repo: string; canWrite: boolean; private: boolean }> {
  const full = normalizeRepo(repo);
  if (!full) throw new AppError('Use owner/repo or https://github.com/owner/repo', { statusCode: 400 });
  const data = await createGithubClient(token).get<{
    full_name: string;
    private: boolean;
    permissions?: { push?: boolean; admin?: boolean; maintain?: boolean };
  }>(`/repos/${full}`);
  const p = data.permissions ?? {};
  return { repo: data.full_name, canWrite: Boolean(p.push || p.admin || p.maintain), private: data.private };
}
