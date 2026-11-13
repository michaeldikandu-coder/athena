import { NextFunction, Request, Response, RequestHandler } from 'express';
import { z, ZodSchema } from 'zod';
import { ValidationError, commonSchemas } from '@athena/shared';

/**
 * Validate and replace req.body / req.query / req.params with parsed values
 */
export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;
      const result = schema.safeParse(req[key]);
      if (!result.success) {
        return next(new ValidationError(`Invalid request ${key}`, result.error.errors));
      }
      if (key === 'query') {
        // req.query is a getter in Express 4; mutate in place
        Object.keys(req.query).forEach((k) => delete (req.query as Record<string, unknown>)[k]);
        Object.assign(req.query, result.data);
      } else {
        (req as unknown as Record<string, unknown>)[key] = result.data;
      }
    }
    next();
  };
}

export const idParams = z.object({ id: commonSchemas.objectId });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Forward async errors to the error middleware
 */
export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
