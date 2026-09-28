export interface ParsedCommand {
  program: string;
  command?: string;
  args: string[];
  flags: Record<string, string | boolean>;
  raw: string;
}

export interface FlagSpec {
  /** Canonical flag name used as the key in `ParsedCommand.flags`, e.g. `m`. */
  name: string;
  aliases?: string[];
  takesValue: boolean;
  /** Joins repeated values (Git joins repeated `-m` values as separate paragraphs). */
  repeatSeparator?: string;
}

export interface GitCommandSpec {
  name: string;
  summary: string;
  usage: string;
  flags: FlagSpec[];
  requiredFlags?: { name: string; message: string }[];
  acceptsArguments: boolean;
  /** Upper bound on positional arguments; unlimited when omitted. */
  maxArguments?: number;
}
