import next from "@gitdojo/config/eslint/next";

/**
 * Architecture rules (see docs/architecture.md#design-patterns). Flat config replaces a rule's
 * options instead of merging them, so each scope below gets its full, computed restriction list.
 */

/**
 * Features by layer, lowest first. A feature may import only features in lower layers, so the
 * dependency graph can never have a cycle. To depend on a feature in the same layer, move one of
 * them up a layer (or invert the dependency: pass a callback in, as the repository panels do).
 */
const LAYERS = [
  ["auth"],
  ["progress", "repository", "terminal"],
  ["course", "challenges", "editor", "conflicts", "releases"],
  ["lesson", "errors"],
  ["workspace", "dashboard"],
  ["playground"],
];

/**
 * Third-party SDKs behind a facade: only the listed scopes may import them, so swapping or
 * upgrading one touches one place. Scopes are the keys of SCOPES below.
 */
const FACADES = [
  {
    modules: ["postgres"],
    owners: ["lib/db", "lib/account-progress/postgres-store"],
    message: "PostgreSQL is an adapter: query through lib/db or a *-store adapter.",
  },
  {
    modules: ["@asgardeo/nextjs", "@asgardeo/*"],
    owners: ["lib/auth", "features/auth/services", "proxy", "app/(account)/layout"],
    message: "The identity SDK is wrapped by lib/auth (server) and features/auth (browser).",
  },
  {
    modules: ["isomorphic-git", "@isomorphic-git/*"],
    owners: [],
    message: "Only @gitdojo/git-engine talks to isomorphic-git: use its GitEngine.",
  },
  {
    // The pipeline: commands reach Git, repository state and validation only through
    // WorkspaceSession, so state, validation and progress are always recomputed together.
    modules: ["@gitdojo/git-engine", "@gitdojo/repository-state", "@gitdojo/validator"],
    owners: ["features/workspace/services"],
    allowTypeImports: true,
    // Error classes, for `instanceof` checks on what the session rejects with.
    allowImportNames: ["FileNotFoundError"],
    message: "Run Git, state reads and validation through WorkspaceSession (features/workspace).",
  },
  {
    modules: ["zustand", "zustand/*"],
    owners: ["features/*/state"],
    message: "Zustand stores live in a feature's state/ folder.",
  },
  {
    modules: ["@xyflow/react"],
    owners: ["features/repository"],
    message: "The graph library is wrapped by the repository feature.",
  },
  {
    modules: ["@xterm/*"],
    owners: ["features/terminal"],
    message: "xterm.js is wrapped by the terminal feature.",
  },
  {
    modules: ["monaco-editor", "@monaco-editor/*"],
    owners: ["features/editor"],
    message: "Monaco is wrapped by the editor feature.",
  },
];

const PUBLIC_API = {
  group: ["@/features/*/**"],
  message: 'Import another feature through its public API, "@/features/<name>" (its index.ts).',
};

const FEATURES = LAYERS.flat();
const layerOf = (feature) => LAYERS.findIndex((layer) => layer.includes(feature));

/** Scope name → files. Later scopes override earlier ones for the files they match. */
const SCOPES = {
  app: ["app/**/*.{ts,tsx}"],
  "app/(account)/layout": ["app/(account)/layout.tsx"],
  proxy: ["proxy.ts"],
  components: ["components/**/*.{ts,tsx}"],
  lib: ["lib/**/*.ts"],
  "lib/db": ["lib/db/**/*.ts"],
  "lib/auth": ["lib/auth/**/*.ts"],
  "lib/account-progress/postgres-store": ["lib/account-progress/postgres-store.ts"],
  ...Object.fromEntries(
    FEATURES.flatMap((feature) => [
      [`features/${feature}`, [`features/${feature}/**/*.{ts,tsx}`]],
      [`features/${feature}/state`, [`features/${feature}/state/**/*.ts`]],
      [`features/${feature}/services`, [`features/${feature}/services/**/*.{ts,tsx}`]],
    ]),
  ),
};

const owns = (scope, owner) => {
  const escapedOwner = owner.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\*/g, "[^/]+");
  return new RegExp(`^${escapedOwner}(/|$)`).test(scope);
};

function restrictions(scope) {
  const patterns = FACADES.filter(({ owners }) => !owners.some((owner) => owns(scope, owner))).map(
    ({ modules, owners: _owners, ...rest }) => ({ group: modules, ...rest }),
  );
  // Routes are the composition root: as server components, they import a page's entry component
  // by path so the server never loads the rest of a feature's (browser-only) public API.
  if (!scope.startsWith("app")) patterns.push(PUBLIC_API);

  const feature = /^features\/([a-z-]+)/.exec(scope)?.[1];
  if (feature) {
    const notBelow = FEATURES.filter(
      (other) => other !== feature && layerOf(other) >= layerOf(feature),
    );
    if (notBelow.length > 0) {
      patterns.push({
        group: notBelow.map((other) => `@/features/${other}`),
        message: `"${feature}" may only depend on features in lower layers (see LAYERS), not ${notBelow.join(", ")}.`,
      });
    }
  }
  if (scope.startsWith("lib")) {
    // Server code may share a feature's types (the API contract), never its browser code.
    patterns.push({
      group: ["@/features", "@/features/*"],
      allowTypeImports: true,
      message: "Server code (lib/) may only import types from features.",
    });
  }
  return { "@typescript-eslint/no-restricted-imports": ["error", { patterns }] };
}

export default [
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "playwright-report/**",
      "test-results/**",
      "public/monaco/**",
      "scripts/**",
      // Plain Node test tooling (the mock identity provider), like scripts/.
      "e2e/mock-idp/**",
      // Plain JavaScript shared with scripts/migrate.mjs; covered by lib/db/connection.test.ts.
      "lib/db/connection.mjs",
    ],
  },
  ...next,
  ...Object.entries(SCOPES).map(([scope, files]) => ({ files, rules: restrictions(scope) })),
  {
    // Tests set up whatever the code under test needs (stores, real adapters, fixtures).
    files: ["**/*.test.{ts,tsx}", "e2e/**", "perf/**", "test/**"],
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
];
