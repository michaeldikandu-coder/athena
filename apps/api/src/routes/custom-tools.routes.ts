import { Router } from 'express';
import { z } from 'zod';
import { AgentToolModel, CustomToolModel, ICustomTool } from '@athena/database';
import { toolRegistry } from '@athena/core';
import { buildCustomTool, customToolId, sendCustomRequest } from '@athena/integrations';
import { AppError, NotFoundError, ValidationError, decryptSecret, encryptSecret, successResponse } from '@athena/shared';
import { asyncHandler, idParams, validate } from '../middleware/validate';

/**
 * User-defined HTTP tools (Build > Custom tools). Each belongs to one user and
 * can be assigned to that user's agents like any built-in tool.
 */
const router = Router();

const FORBIDDEN_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'cookie', 'content-type']);
const headerName = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9-]{1,60}$/, 'Header names use letters, numbers and dashes')
  .refine((h) => !FORBIDDEN_HEADERS.has(h.toLowerCase()), 'This header is set by Athena');
const inputName = z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_]{0,40}$/, 'Input names use letters, numbers and _');

const toolBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    description: z.string().trim().min(10).max(500),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z
      .string()
      .trim()
      .max(1000)
      .refine((u) => {
        try {
          const parsed = new URL(u.replace(/\{[A-Za-z_][A-Za-z0-9_]*\}/g, 'x'));
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      }, 'Use a full http(s) URL, e.g. https://api.example.com/orders/{orderId}'),
    inputs: z
      .array(
        z.object({
          name: inputName,
          type: z.enum(['string', 'number', 'boolean']),
          description: z.string().trim().max(300).default(''),
          required: z.boolean().default(true),
        })
      )
      .max(20)
      .default([]),
    headers: z.record(headerName, z.string().max(1000)).default({}),
    secretHeaderName: z.union([headerName, z.literal('')]).optional(),
    /** Omit to keep the stored secret; "" removes it */
    secretValue: z.string().max(2000).optional(),
    requiresApproval: z.boolean().optional(),
  })
  .superRefine((body, ctx) => {
    const names = body.inputs.map((i) => i.name);
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: 'custom', path: ['inputs'], message: 'Input names must be unique' });
    }
    for (const match of body.url.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
      if (!names.includes(match[1])) {
        ctx.addIssue({ code: 'custom', path: ['url'], message: `URL uses {${match[1]}} but there is no input with that name` });
      }
    }
    if (body.secretValue && !body.secretHeaderName) {
      ctx.addIssue({ code: 'custom', path: ['secretHeaderName'], message: 'Name the header that carries the secret' });
    }
  });

type ToolBody = z.infer<typeof toolBody>;

function parse(body: unknown): ToolBody {
  const parsed = toolBody.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.errors[0];
    throw new ValidationError(`${issue.path.join('.') || 'body'}: ${issue.message}`, parsed.error.errors);
  }
  return parsed.data;
}

function hint(secret: string): string {
  return secret.length <= 8 ? '••••' : `${secret.slice(0, 4)}…${secret.slice(-4)}`;
}

function serialize(doc: ICustomTool & { _id: unknown }) {
  return {
    id: String(doc._id),
    toolId: doc.toolId,
    name: doc.name,
    description: doc.description,
    method: doc.method,
    url: doc.url,
    inputs: doc.inputs,
    headers: doc.headers ?? {},
    secretHeaderName: doc.secretHeaderName ?? null,
    secretHint: doc.secretHint ?? null,
    requiresApproval: doc.requiresApproval,
    permission: doc.method === 'GET' ? 'read:http' : 'write:http',
    updatedAt: doc.updatedAt,
  };
}

async function findOwned(id: string, userId: string, withSecret = false) {
  const query = CustomToolModel.findOne({ _id: id, userId });
  const doc = (await (withSecret ? query.select('+secretEncrypted') : query).lean()) as (ICustomTool & { _id: unknown }) | null;
  if (!doc) throw new NotFoundError('Custom tool', id);
  return doc;
}

function fields(body: ToolBody) {
  return {
    name: body.name,
    description: body.description,
    method: body.method,
    url: body.url,
    inputs: body.inputs,
    headers: body.headers,
    secretHeaderName: body.secretHeaderName || undefined,
    // Changing data asks a person first unless the owner turns it off
    requiresApproval: body.requiresApproval ?? body.method !== 'GET',
  };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const docs = (await CustomToolModel.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean()) as Array<ICustomTool & { _id: unknown }>;
    res.json(successResponse(docs.map(serialize)));
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parse(req.body);
    const doc = await CustomToolModel.create({
      ...fields(body),
      userId: req.user!.id,
      toolId: customToolId(body.name),
      ...(body.secretValue ? { secretEncrypted: encryptSecret(body.secretValue), secretHint: hint(body.secretValue) } : {}),
    });
    const saved = doc.toObject() as ICustomTool & { _id: unknown };
    toolRegistry.register(buildCustomTool(saved), { override: true });
    res.status(201).json(successResponse(serialize(saved)));
  })
);

router.put(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await findOwned(req.params.id, req.user!.id);
    const body = parse(req.body);
    const secretUpdate =
      body.secretValue === undefined
        ? {}
        : body.secretValue === ''
          ? { $unset: { secretEncrypted: 1, secretHint: 1 } }
          : { secretEncrypted: encryptSecret(body.secretValue), secretHint: hint(body.secretValue) };
    const doc = (await CustomToolModel.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.id },
      { ...fields(body), ...secretUpdate },
      { new: true }
    ).lean()) as ICustomTool & { _id: unknown };
    toolRegistry.register(buildCustomTool(doc), { override: true });
    res.json(successResponse(serialize(doc)));
  })
);

router.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const doc = await findOwned(req.params.id, req.user!.id);
    await Promise.all([
      CustomToolModel.deleteOne({ _id: req.params.id, userId: req.user!.id }),
      AgentToolModel.deleteMany({ toolId: doc.toolId }),
    ]);
    toolRegistry.unregister(doc.toolId);
    res.json(successResponse({ deleted: true }));
  })
);

const testBody = z.object({ input: z.record(z.unknown()).default({}) });

/**
 * Send one real request with sample inputs, so the user can check the URL,
 * headers and secret before an agent uses the tool.
 */
router.post(
  '/:id/test',
  validate({ params: idParams, body: testBody }),
  asyncHandler(async (req, res) => {
    const doc = await findOwned(req.params.id, req.user!.id, true);
    const tool = buildCustomTool(doc);
    const parsed = tool.inputSchema.safeParse((req.body as z.infer<typeof testBody>).input);
    if (!parsed.success) {
      const issue = parsed.error.errors[0];
      throw new ValidationError(`${issue.path.join('.')}: ${issue.message}`, parsed.error.errors);
    }
    try {
      const secret = doc.secretEncrypted ? decryptSecret(doc.secretEncrypted) : null;
      const result = await sendCustomRequest(doc, parsed.data, secret);
      res.json(successResponse(result));
    } catch (error) {
      const err = error as { code?: string; message: string };
      throw new AppError(`Request failed: ${err.code === 'EBLOCKEDADDRESS' ? err.message : err.code || err.message}`, {
        statusCode: 422,
      });
    }
  })
);

export default router;
