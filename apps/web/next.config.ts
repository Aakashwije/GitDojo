import { type NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source; Next compiles them like app code.
  transpilePackages: [
    "@gitdojo/challenge-engine",
    "@gitdojo/command-parser",
    "@gitdojo/error-engine",
    "@gitdojo/git-engine",
    "@gitdojo/hints",
    "@gitdojo/lesson-engine",
    "@gitdojo/repository-state",
    "@gitdojo/shared-types",
    "@gitdojo/ui",
    "@gitdojo/validator",
  ],
};

export default nextConfig;
