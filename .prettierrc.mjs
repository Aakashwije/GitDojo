import config from "@gitdojo/config/prettier";

export default {
  ...config,
  // Lets the Tailwind plugin sort classes using GitDojo's design tokens.
  tailwindStylesheet: "./apps/web/app/globals.css",
};
