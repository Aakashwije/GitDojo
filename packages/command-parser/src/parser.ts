import {
  GIT_COMMAND_SPECS,
  isBuiltinProgram,
  isSupportedGitCommand,
  PLANNED_GIT_COMMANDS,
} from "./commands";
import { parseError, type ParseError, type ParseResult } from "./errors";
import { tokenize } from "./tokenizer";
import { type FlagSpec, type GitCommandSpec, type ParsedCommand } from "./types";

export const GIT_USAGE = [
  "usage: git <command> [<args>]",
  "",
  "Commands available in GitDojo:",
  ...Object.values(GIT_COMMAND_SPECS).map((spec) => `   ${spec.name.padEnd(10)}${spec.summary}`),
].join("\n");

export function notAGitCommandMessage(command: string): string {
  return `git: '${command}' is not a git command.`;
}

function fail(raw: string, error: ParseError): ParseResult {
  return { ok: false, error, raw };
}

/** Parses one line of terminal input. Never throws. */
export function parseCommand(raw: string): ParseResult {
  const tokenized = tokenize(raw);
  if (!tokenized.ok) return fail(raw, tokenized.error);

  const [program, ...rest] = tokenized.tokens;
  if (program === undefined) return fail(raw, parseError("EMPTY_COMMAND", ""));

  if (isBuiltinProgram(program)) {
    return { ok: true, command: { program, args: rest, flags: {}, raw } };
  }

  if (program !== "git") {
    return fail(
      raw,
      parseError(
        "UNSUPPORTED_PROGRAM",
        `${program}: command not found\nGitDojo's terminal runs Git commands only. Type 'help' to see what's available.`,
      ),
    );
  }

  const [command, ...commandTokens] = rest;
  if (command === undefined) return fail(raw, parseError("MISSING_GIT_COMMAND", GIT_USAGE));

  if (!isSupportedGitCommand(command)) {
    const message = PLANNED_GIT_COMMANDS.has(command)
      ? `git: '${command}' is not available in GitDojo yet.`
      : notAGitCommandMessage(command);
    return fail(raw, parseError("UNSUPPORTED_GIT_COMMAND", message));
  }

  const spec: GitCommandSpec = GIT_COMMAND_SPECS[command];
  const parsedOptions = parseOptions(spec, commandTokens);
  if (!parsedOptions.ok) return fail(raw, parsedOptions.error);

  const { args, flags } = parsedOptions;
  const maxArguments = spec.acceptsArguments ? (spec.maxArguments ?? Infinity) : 0;
  if (args.length > maxArguments) {
    return fail(
      raw,
      parseError(
        "UNEXPECTED_ARGUMENT",
        `error: unexpected argument '${args[maxArguments] ?? ""}'\nusage: ${spec.usage}`,
      ),
    );
  }
  for (const required of spec.requiredFlags ?? []) {
    if (!(required.name in flags)) {
      return fail(raw, parseError("MISSING_REQUIRED_FLAG", required.message));
    }
  }

  return { ok: true, command: { program, command, args, flags, raw } };
}

type OptionsResult =
  { ok: true; args: string[]; flags: ParsedCommand["flags"] } | { ok: false; error: ParseError };

function findFlag(spec: GitCommandSpec, name: string): FlagSpec | undefined {
  return spec.flags.find((flag) => flag.name === name || flag.aliases?.includes(name));
}

function parseOptions(spec: GitCommandSpec, tokens: string[]): OptionsResult {
  const args: string[] = [];
  const flags: ParsedCommand["flags"] = {};
  let optionsEnded = false;

  const setFlag = (flag: FlagSpec, value: string | boolean) => {
    const previous = flags[flag.name];
    flags[flag.name] =
      typeof previous === "string" && typeof value === "string" && flag.repeatSeparator
        ? `${previous}${flag.repeatSeparator}${value}`
        : value;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";

    if (optionsEnded || !token.startsWith("-") || token === "-") {
      args.push(token);
      continue;
    }
    if (token === "--") {
      optionsEnded = true;
      continue;
    }

    const isLong = token.startsWith("--");
    const body = token.slice(isLong ? 2 : 1);
    const equalsIndex = isLong ? body.indexOf("=") : -1;
    // Short flags are single letters; anything after the letter is an attached value (`-mmsg`).
    const name = isLong ? (equalsIndex === -1 ? body : body.slice(0, equalsIndex)) : body.charAt(0);
    const attached = isLong
      ? equalsIndex === -1
        ? undefined
        : body.slice(equalsIndex + 1)
      : body.length > 1
        ? body.slice(1)
        : undefined;

    const flag = findFlag(spec, name);
    if (!flag) {
      const display = isLong ? `--${name}` : `-${name}`;
      return {
        ok: false,
        error: parseError(
          "UNKNOWN_FLAG",
          `error: unknown option '${display}'\nusage: ${spec.usage}`,
        ),
      };
    }

    if (!flag.takesValue) {
      if (attached !== undefined) {
        return {
          ok: false,
          error: parseError("UNKNOWN_FLAG", `error: option '${name}' takes no value`),
        };
      }
      setFlag(flag, true);
      continue;
    }

    const value = attached ?? tokens[index + 1];
    if (value === undefined) {
      return {
        ok: false,
        error: parseError("MISSING_FLAG_VALUE", `error: switch '${name}' requires a value`),
      };
    }
    if (attached === undefined) index += 1;
    setFlag(flag, value);
  }

  return { ok: true, args, flags };
}
