import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  agentRules: false,
};

export default nextConfig;
