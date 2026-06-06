import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root: the parent home dir has stray lockfiles that Next
  // would otherwise infer as the project root.
  turbopack: {
    root: import.meta.dirname,
  },
};

export default nextConfig;
