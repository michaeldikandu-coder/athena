/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `next dev` and `next build` must never share an output folder: a production
  // build over a running dev server's folder breaks it with "Cannot find module './NNN.js'".
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  experimental: {
    // The API (src/pages/api) loads the monorepo's workspace packages; trace
    // files from the repo root so they are included in the deployment
    outputFileTracingRoot: path.join(__dirname, '../../'),
    // Keep class names in the bundled API: error codes come from error class names
    serverMinification: false,
  },
};

module.exports = nextConfig;
