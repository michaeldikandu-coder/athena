import { Router } from 'express';
import { listApplications, toolRegistry } from '@athena/core';
import { successResponse } from '@athena/shared';

const router = Router();

router.get('/', (_req, res) => {
  const usage = new Map<string, string[]>();
  for (const app of listApplications()) {
    for (const tool of app.tools) {
      usage.set(tool.id, [...(usage.get(tool.id) ?? []), app.id]);
    }
  }
  const tools = toolRegistry.describeAll().map((tool) => ({
    ...tool,
    usedBy: usage.get(tool.id) ?? (tool.category === 'memory' ? ['built-in'] : []),
  }));
  res.json(successResponse(tools));
});

export default router;
