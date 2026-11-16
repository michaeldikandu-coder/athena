import type { NextApiRequest, NextApiResponse } from 'next';
import { waitUntil } from '@vercel/functions';
import { createServerlessHandler } from '@athena/api/dist/serverless';

/**
 * The whole Athena API (apps/api, an Express app) served from this Next.js
 * app, so the dashboard and API deploy together, e.g. as one Vercel project.
 */
export const config = {
  api: {
    // Express parses bodies itself and keeps the raw bytes for webhook signatures
    bodyParser: false,
    externalResolver: true,
    responseLimit: false,
  },
  // Vercel function limit; long runs continue in follow-up invocations
  maxDuration: 300,
};

const handler = createServerlessHandler({
  // On Vercel, keep the function alive for work that continues after the response
  waitUntil: process.env.VERCEL ? waitUntil : undefined,
});

export default function athenaApi(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  return handler(req, res);
}
