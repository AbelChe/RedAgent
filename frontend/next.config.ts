import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/tasks/:path*',
        destination: 'http://localhost:8000/tasks/:path*',
      },
      {
        source: '/workspaces/:path*',
        destination: 'http://localhost:8000/workspaces/:path*',
      },
      {
        source: '/ws/:path*',
        destination: 'http://localhost:8000/ws/:path*',
      }
    ]
  },
};

export default nextConfig;
