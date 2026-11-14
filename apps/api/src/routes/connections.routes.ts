import { Router } from 'express';
import { z } from 'zod';
import { CONNECTION_PROVIDERS, ConnectionProvider, ValidationError, successResponse } from '@athena/shared';
import { asyncHandler, validate } from '../middleware/validate';
import {
  connectionInputSchemas,
  deleteConnection,
  listConnections,
  saveConnection,
  serverPolicy,
  testConnection,
} from '../services/connections.service';

const router = Router();

const providerParams = z.object({ provider: z.enum(CONNECTION_PROVIDERS) });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(successResponse({ connections: await listConnections(req.user!.id), server: serverPolicy() }));
  })
);

router.put(
  '/:provider',
  validate({ params: providerParams }),
  asyncHandler(async (req, res) => {
    const provider = req.params.provider as ConnectionProvider;
    // Each provider has its own body schema; report the first problem in words
    const parsed = connectionInputSchemas[provider].safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      const field = issue.path.join('.');
      throw new ValidationError(field ? `${field}: ${issue.message}` : issue.message, parsed.error.errors);
    }
    res.json(successResponse(await saveConnection(req.user!.id, provider, parsed.data)));
  })
);

router.post(
  '/:provider/test',
  validate({ params: providerParams }),
  asyncHandler(async (req, res) => {
    res.json(successResponse(await testConnection(req.user!.id, req.params.provider as ConnectionProvider)));
  })
);

router.delete(
  '/:provider',
  validate({ params: providerParams }),
  asyncHandler(async (req, res) => {
    await deleteConnection(req.user!.id, req.params.provider as ConnectionProvider);
    res.json(successResponse({ deleted: true }));
  })
);

export default router;
