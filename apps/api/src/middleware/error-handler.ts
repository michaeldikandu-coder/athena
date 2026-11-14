import { NextFunction, Request, Response } from 'express';
import { Error as MongooseError } from 'mongoose';
import { explainMongoError, isMongoUnavailableError } from '@athena/database';
import { AppError, errorResponse, logger } from '@athena/shared';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(errorResponse(`Route not found: ${req.method} ${req.path}`, { code: 'not_found' }));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error('Request failed', err, { path: req.path });
    const details = err.context?.validationErrors;
    res.status(err.statusCode).json(
      errorResponse(err.message, {
        code: err.name,
        details: err.statusCode < 500 ? details : undefined,
      })
    );
    return;
  }

  if (isMongoUnavailableError(err) || /buffering timed out|before initial connection/i.test(String((err as Error)?.message))) {
    const reason = explainMongoError(err);
    logger.error('Database unavailable', { path: req.path, reason });
    res.status(503).json(errorResponse(`Database unavailable: ${reason}`, { code: 'database_unavailable' }));
    return;
  }

  if (err instanceof MongooseError.CastError) {
    res.status(400).json(errorResponse('Invalid identifier', { code: 'invalid_id' }));
    return;
  }

  if (err instanceof MongooseError.ValidationError) {
    res.status(400).json(errorResponse(err.message, { code: 'validation_error' }));
    return;
  }

  if ((err as { code?: number }).code === 11000) {
    res.status(409).json(errorResponse('Resource already exists', { code: 'conflict' }));
    return;
  }

  if ((err as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json(errorResponse('Malformed JSON body', { code: 'bad_json' }));
    return;
  }

  logger.error('Unhandled error', err as Error, { path: req.path, method: req.method });
  res.status(500).json(errorResponse('Internal server error', { code: 'internal_error' }));
}
