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
  const full = repo || process.env.GITHUB_REPO;
  if (!full) throw new AppError('GITHUB_REPO is not configured', { statusCode: 503 });

  const allowed = new Set(
    [process.env.GITHUB_REPO, ...(process.env.GITHUB_ALLOWED_REPOS || '').split(',')]
      .map((r) => r?.trim().toLowerCase())
      .filter(Boolean) as string[]
  );
  if (!allowed.has(full.toLowerCase())) {
    throw new AppError(`Repository ${full} is not in the allowed list`, { statusCode: 403 });
  }
  const [owner, name] = full.split('/');
  if (!owner || !name) throw new AppError(`Invalid repository: ${full}`, { statusCode: 400 });
  return { owner, name, full };
}

export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}
