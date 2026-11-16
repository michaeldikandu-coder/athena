import { Router } from 'express';
import { CUSTOM_TOOL_ID_PREFIX, listApplications, loadUserTools, toolRegistry } from '@athena/core';
import { CustomToolModel } from '@athena/database';
import { successResponse } from '@athena/shared';
import { asyncHandler } from '../middleware/validate';

const router = Router();

/**
 * Built-in tools plus the signed-in user's own custom tools. Other users'
 * custom tools are never listed.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const usage = new Map<string, string[]>();
    for (const app of listApplications()) {
      for (const tool of app.tools) {
        usage.set(tool.id, [...(usage.get(tool.id) ?? []), app.id]);
      }
    }
    const ownIds = (await CustomToolModel.find({ userId: req.user!.id }).select('toolId').lean()).map((d) => d.toolId);
    const own = await loadUserTools(req.user!.id, ownIds);
    own.forEach((tool) => toolRegistry.register(tool, { override: true }));
    const ownSet = new Set(own.map((t) => t.id));

    const tools = toolRegistry
      .describeAll()
      .filter((tool) => !tool.id.startsWith(CUSTOM_TOOL_ID_PREFIX) || ownSet.has(tool.id))
      .map((tool) => ({
        ...tool,
        usedBy:
          usage.get(tool.id) ??
          (tool.category === 'memory' ? ['built-in'] : tool.category === 'custom' ? ['custom'] : []),
      }));
    res.json(successResponse(tools));
  })
);

export default router;
