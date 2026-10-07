import { type NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The pnpm workspace root. Server files are traced from here, so deployed functions (Vercel)
// include workspace packages and the lesson content outside apps/web.
const workspaceRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  // Routes that read lesson YAML at request time (the progress API validates lesson ids against
  // it). Pages are prerendered at build time and don't need it.
  outputFileTracingIncludes: {
    "/api/progress": ["../../content/**/*.yaml"],
    "/api/progress/challenges": ["../../content/**/*.yaml"],
    "/api/progress/lessons": ["../../content/**/*.yaml"],
  },
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
