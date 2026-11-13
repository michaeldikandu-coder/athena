import { PermissionDeniedError, logger } from '@athena/shared';

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface PermissionCheck {
  agentId: string;
  userId: string;
  permissions: string[];
  resource: string;
  action: string;
}

/**
 * Permission Manager - Handles permission checking and validation
 */
export class PermissionManager {
  private static instance: PermissionManager;
  private permissionCache: Map<string, boolean> = new Map();
  private cacheTimeout = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): PermissionManager {
    if (!PermissionManager.instance) {
      PermissionManager.instance = new PermissionManager();
    }
    return PermissionManager.instance;
  }

  /**
   * Check if a permission is granted
   */
  async check(check: PermissionCheck): Promise<boolean> {
    const cacheKey = this.getCacheKey(check);
    const cached = this.permissionCache.get(cacheKey);

    if (cached !== undefined) {
      return cached;
    }

    const granted = this.evaluatePermission(check);

    // Cache the result
    this.permissionCache.set(cacheKey, granted);
    setTimeout(() => this.permissionCache.delete(cacheKey), this.cacheTimeout);

    logger.debug('Permission check', {
      agentId: check.agentId,
      resource: check.resource,
      action: check.action,
      granted,
    });

    return granted;
  }

  /**
   * Assert that a permission is granted, throw if not
   */
  async assert(check: PermissionCheck): Promise<void> {
    const granted = await this.check(check);

    if (!granted) {
      const action = `${check.action}:${check.resource}`;
      logger.warn('Permission denied', {
        agentId: check.agentId,
        userId: check.userId,
        action,
      });
      throw new PermissionDeniedError(action, 'Insufficient permissions');
    }
  }

  /**
   * Check if agent has permission to use a tool
   */
  async checkToolPermission(
    agentId: string,
    userId: string,
    toolId: string,
    requiredPermissions: string[]
  ): Promise<boolean> {
    return this.check({
      agentId,
      userId,
      permissions: requiredPermissions,
      resource: 'tool',
      action: toolId,
    });
  }

  /**
   * Evaluate permission based on rules
   */
  private evaluatePermission(check: PermissionCheck): boolean {
    const requiredPermission = `${check.action}:${check.resource}`;

    // Check for exact match
    if (check.permissions.includes(requiredPermission)) {
      return true;
    }

    // Check for wildcard permissions
    if (check.permissions.includes(`${check.action}:*`)) {
      return true;
    }

    if (check.permissions.includes(`*:${check.resource}`)) {
      return true;
    }

    if (check.permissions.includes('*:*')) {
      return true;
    }

    // Check for admin permission
    if (check.permissions.includes('admin')) {
      return true;
    }

    return false;
  }

  /**
   * Generate cache key
   */
  private getCacheKey(check: PermissionCheck): string {
    return `${check.agentId}:${check.resource}:${check.action}`;
  }

  /**
   * Clear permission cache
   */
  clearCache(): void {
    this.permissionCache.clear();
    logger.debug('Permission cache cleared');
  }

  /**
   * Clear cache for specific agent
   */
  clearAgentCache(agentId: string): void {
    for (const key of this.permissionCache.keys()) {
      if (key.startsWith(`${agentId}:`)) {
        this.permissionCache.delete(key);
      }
    }
    logger.debug('Agent permission cache cleared', { agentId });
  }

  /**
   * Get all permissions for a resource
   */
  getResourcePermissions(resource: string): string[] {
    const actions = ['read', 'write', 'delete', 'execute'];
    return actions.map((action) => `${action}:${resource}`);
  }

  /**
   * Parse permission string
   */
  parsePermission(permission: string): { action: string; resource: string } {
    const [action, resource] = permission.split(':');
    return { action: action || '*', resource: resource || '*' };
  }

  /**
   * Format permission string
   */
  formatPermission(action: string, resource: string): string {
    return `${action}:${resource}`;
  }
}

// Export singleton instance
export const permissionManager = PermissionManager.getInstance();
