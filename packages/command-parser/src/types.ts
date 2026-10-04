export interface ParsedCommand {
  program: string;
  command?: string;
  args: string[];
  flags: Record<string, string | boolean>;
  raw: string;
  /**
   * Where `--` appeared, as an index into `args`: everything from there on is a path, never a
   * revision (`git reset HEAD~1 -- README.md`). Absent when there was no `--`.
   */
  pathsFrom?: number;
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
