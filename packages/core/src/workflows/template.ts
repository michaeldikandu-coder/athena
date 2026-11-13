/**
 * Minimal templating for workflow step configs.
 * "{{trigger.payload.id}}" alone returns the raw value; inside a longer string
 * values are stringified. Only dotted property paths are supported (no code).
 */

const FULL_TEMPLATE = /^\{\{\s*([a-zA-Z0-9_.[\]-]+)\s*\}\}$/;
const INLINE_TEMPLATE = /\{\{\s*([a-zA-Z0-9_.[\]-]+)\s*\}\}/g;

export function getPath(source: unknown, path: string): unknown {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: any = source;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') return undefined;
    current = current[part];
  }
  return current;
}

export function renderTemplate(value: unknown, scope: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const full = value.match(FULL_TEMPLATE);
    if (full) return getPath(scope, full[1]);
    return value.replace(INLINE_TEMPLATE, (_, path: string) => {
      const resolved = getPath(scope, path);
      if (resolved === undefined || resolved === null) return '';
      return typeof resolved === 'object' ? JSON.stringify(resolved) : String(resolved);
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => renderTemplate(item, scope));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      result[key] = renderTemplate(item, scope);
    }
    return result;
  }
  return value;
}

export type ConditionOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'exists'
  | 'not_exists'
  | 'in';

export interface Condition {
  path: string;
  operator: ConditionOperator;
  value?: unknown;
}

export function evaluateCondition(condition: Condition, scope: Record<string, unknown>): boolean {
  const actual = getPath(scope, condition.path);
  const expected = condition.value;

  switch (condition.operator) {
    case 'eq':
      return actual === expected || String(actual) === String(expected);
    case 'neq':
      return !(actual === expected || String(actual) === String(expected));
    case 'gt':
      return Number(actual) > Number(expected);
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lt':
      return Number(actual) < Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'contains':
      if (Array.isArray(actual)) return actual.includes(expected);
      return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase());
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'in':
      return Array.isArray(expected) && expected.map(String).includes(String(actual));
    default:
      return false;
  }
}

/**
 * Match an event name against a pattern supporting a trailing or inner "*"
 */
export function matchEventName(pattern: string, event: string): boolean {
  if (pattern === '*' || pattern === event) return true;
  const regex = new RegExp(
    '^' + pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$'
  );
  return regex.test(event);
}
