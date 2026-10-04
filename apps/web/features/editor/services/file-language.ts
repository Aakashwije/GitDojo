const BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  xml: "xml",
  svg: "xml",
  yml: "yaml",
  yaml: "yaml",
  py: "python",
  rb: "ruby",
  go: "go",
  rs: "rust",
  java: "java",
  kt: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cs: "csharp",
  php: "php",
  sh: "shell",
  bash: "shell",
  sql: "sql",
  toml: "ini",
  ini: "ini",
};

const BY_NAME: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "plaintext",
};

/** Monaco language id for a path, by extension; `plaintext` when unknown. */
export function languageForPath(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  const byName = BY_NAME[name];
  if (byName) return byName;
  const dot = name.lastIndexOf(".");
  // Dotfiles such as `.gitignore` have no extension.
  if (dot <= 0) return "plaintext";
  return BY_EXTENSION[name.slice(dot + 1)] ?? "plaintext";
}

/** Human-readable language name for the status bar. */
export function languageLabel(language: string): string {
  const labels: Record<string, string> = {
    typescript: "TypeScript",
    javascript: "JavaScript",
    json: "JSON",
    markdown: "Markdown",
    css: "CSS",
    scss: "SCSS",
    html: "HTML",
    yaml: "YAML",
    python: "Python",
    plaintext: "Plain text",
    shell: "Shell",
  };
  return labels[language] ?? language.charAt(0).toUpperCase() + language.slice(1);
}
