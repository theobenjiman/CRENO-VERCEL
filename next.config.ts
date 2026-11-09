import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Photos are shrunk in the browser first; 4 MB stays under Vercel (4.5 MB) and Netlify (6 MB) request limits.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
