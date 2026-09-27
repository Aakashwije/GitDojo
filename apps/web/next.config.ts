import { type NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; Next compiles them like app code.
  transpilePackages: [
    "@gitdojo/command-parser",
    "@gitdojo/git-engine",
    "@gitdojo/lesson-engine",
    "@gitdojo/repository-state",
    "@gitdojo/shared-types",
    "@gitdojo/ui",
    "@gitdojo/validator",
  ],
};

export default nextConfig;
