import { Tool } from '../types/tool.types';

/**
 * Tools that users define at runtime (stored in the database) are loaded per
 * agent through this hook, which the host sets at startup. Core stays free of
 * HTTP and storage details.
 */
export const CUSTOM_TOOL_ID_PREFIX = 'custom_';

type Loader = (userId: string, toolIds: string[]) => Promise<Tool[]>;
let loader: Loader | null = null;

export function setCustomToolLoader(fn: Loader): void {
  loader = fn;
}

export async function loadUserTools(userId: string, toolIds: string[]): Promise<Tool[]> {
  const ids = toolIds.filter((id) => id.startsWith(CUSTOM_TOOL_ID_PREFIX));
  if (!loader || ids.length === 0) return [];
  return loader(userId, ids);
}
