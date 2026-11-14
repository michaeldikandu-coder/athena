import { NextFunction, Request, Response } from 'express';
import { loadUserScope } from '@athena/core';
import { runInUserScope } from '@athena/shared';

/**
 * Make the signed-in user's connections available to connectors for the rest
 * of the request (e.g. listing their Bachs payments). Use after requireAuth.
 */
export function withConnections(req: Request, _res: Response, next: NextFunction): void {
  loadUserScope(req.user!.id)
    .then((scope) => runInUserScope(scope, () => next()))
    .catch(next);
}
