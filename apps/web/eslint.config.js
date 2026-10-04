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
    ],
  },
  ...next,
];
