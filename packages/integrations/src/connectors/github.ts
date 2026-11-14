import { AppError } from '@athena/shared';
import { RestClient } from '../rest/rest-client';

let client: RestClient | undefined;

/**
 * GitHub REST API client. Uses GITHUB_TOKEN (fine-grained token with Issues
 * and Actions access to GITHUB_REPO).
 */
export function github(): RestClient {
  if (client) return client;
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new AppError('GITHUB_TOKEN is not configured', { statusCode: 503 });
  client = new RestClient({
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
  return client;
}

/**
 * Resolve "owner/repo", defaulting to GITHUB_REPO. Only the configured repo
 * (or repos listed in GITHUB_ALLOWED_REPOS) may be used by agents.
 */
export function resolveRepo(repo?: string): { owner: string; name: string; full: string } {
  const raw = repo || process.env.GITHUB_REPO;
  if (!raw) throw new AppError('GITHUB_REPO is not configured', { statusCode: 503 });
  const full = normalizeRepo(raw);
  if (!full) {
    throw new AppError(`Invalid repository: ${raw}. Use owner/repo or https://github.com/owner/repo`, {
      statusCode: 400,
    });
  }

  const allowed = new Set(
    [process.env.GITHUB_REPO, ...(process.env.GITHUB_ALLOWED_REPOS || '').split(',')]
      .map((r) => (r ? normalizeRepo(r)?.toLowerCase() : undefined))
      .filter(Boolean) as string[]
  );
  if (!allowed.has(full.toLowerCase())) {
    throw new AppError(`Repository ${full} is not in the allowed list`, { statusCode: 403 });
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
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}
