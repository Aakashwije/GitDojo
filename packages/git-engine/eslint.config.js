import base from "@gitdojo/config/eslint/base";

export default [
  ...base,
  {
    // The facade over isomorphic-git: the one package allowed to import it.
    rules: { "@typescript-eslint/no-restricted-imports": "off" },
  },
];
