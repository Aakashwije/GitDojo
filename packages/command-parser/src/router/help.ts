import { BUILTIN_PROGRAMS, GIT_COMMAND_SPECS } from "../commands";

export function helpText(): string {
  const rows = [
    ...Object.values(GIT_COMMAND_SPECS).map((spec) => [spec.usage, spec.summary] as const),
    ...Object.entries(BUILTIN_PROGRAMS),
  ];
  const width = Math.max(...rows.map(([usage]) => usage.length)) + 3;
  return [
    "GitDojo terminal - available commands:",
    "",
    ...rows.map(([usage, summary]) => `  ${usage.padEnd(width)}${summary}`),
    "",
    "Everything runs in a safe sandbox inside your browser.",
  ].join("\n");
}
