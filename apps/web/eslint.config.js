import next from "@gitdojo/config/eslint/next";

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
];
