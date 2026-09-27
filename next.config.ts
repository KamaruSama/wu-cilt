import type { NextConfig } from "next";
import packageJson from "./package.json";

// Dynamic base path from environment variable
const basePath = process.env.BASE_PATH || "";

const nextConfig: NextConfig = {
  basePath: basePath,
  assetPrefix: basePath,
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  // Enable standalone output for Docker deployment
  output: "standalone",
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};

export default nextConfig;
