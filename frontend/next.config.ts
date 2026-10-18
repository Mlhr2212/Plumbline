import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for EC2 deployment — Terraform ships
  // .next/standalone (+ .next/static) to S3, the instance runs `node server.js`.
  output: "standalone",
};

export default nextConfig;
