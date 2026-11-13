import { PermissionDeniedError, logger } from '@athena/shared';

/**
 * Permissions are strings of the form "action:resource", for example
 * "read:transactions" or "write:tickets". Either segment may be "*".
 * The special grant "admin" (or "*") matches everything.
 */
export interface PermissionCheck {
  agentId: string;
  userId: string;
  /** Permissions granted to the agent */
  granted: string[];
  /** Permissions the action requires (all must be satisfied) */
  required: string[];
  /** Description of the action, used in errors and logs */
  action: string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  missing: string[];
}

/**
 * Permission Manager - evaluates agent permission grants against requirements.
 * Evaluation is pure and cheap, so results are not cached; this keeps grant
 * changes effective immediately.
 */
export class PermissionManager {
  private static instance: PermissionManager;

  private constructor() {}

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Check whether one granted permission covers one required permission
   */
  matches(granted: string, required: string): boolean {
    if (granted === 'admin' || granted === '*' || granted === '*:*') {
      return true;
    }
    const [gAction, gResource] = this.parse(granted);
    const [rAction, rResource] = this.parse(required);
    const actionOk = gAction === '*' || gAction === rAction;
    const resourceOk = gResource === '*' || gResource === rResource;
    return actionOk && resourceOk;
  }

  /**
   * Evaluate a permission check without throwing
   */
  check(check: PermissionCheck): PermissionCheckResult {
    const missing = check.required.filter(
      (req) => !check.granted.some((grant) => this.matches(grant, req))
    );
    const allowed = missing.length === 0;

    logger.debug('Permission check', {
      agentId: check.agentId,
      action: check.action,
      allowed,
      missing,
    });

    return { allowed, missing };
  }

  /**
   * Assert a permission check passes, throwing PermissionDeniedError otherwise
   */
  assert(check: PermissionCheck): void {
    const result = this.check(check);
    if (!result.allowed) {
      logger.warn('Permission denied', {
        agentId: check.agentId,
        userId: check.userId,
        action: check.action,
        missing: result.missing,
      });
      throw new PermissionDeniedError(
        check.action,
        `Missing permissions: ${result.missing.join(', ')}`
      );
    }
  }

  private parse(permission: string): [string, string] {
    const idx = permission.indexOf(':');
    if (idx === -1) {
      return [permission, '*'];
    }
    return [permission.slice(0, idx) || '*', permission.slice(idx + 1) || '*'];
  }
}

export const permissionManager = PermissionManager.getInstance();
