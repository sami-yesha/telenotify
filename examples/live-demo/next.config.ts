import type { NextConfig } from 'next';

const config: NextConfig = {
  // A self-contained server for the Docker image.
  output: 'standalone',
  // This app lives inside the Telenotify repo; trace files from here, not the repo root.
  outputFileTracingRoot: __dirname,
  poweredByHeader: false,
};

export default config;
