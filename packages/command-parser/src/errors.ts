import { type ParsedCommand } from "./types";

export type ParseErrorCode =
  | "EMPTY_COMMAND"
  | "MALFORMED_QUOTES"
  | "UNSUPPORTED_PROGRAM"
  | "MISSING_GIT_COMMAND"
  | "UNSUPPORTED_GIT_COMMAND"
  | "UNKNOWN_FLAG"
  | "MISSING_FLAG_VALUE"
  | "MISSING_REQUIRED_FLAG"
  | "UNEXPECTED_ARGUMENT";

export interface ParseError {
  code: ParseErrorCode;
  /** Terminal-ready, Git-like message. */
  message: string;
}

export type ParseResult =
  { ok: true; command: ParsedCommand } | { ok: false; error: ParseError; raw: string };

export function parseError(code: ParseErrorCode, message: string): ParseError {
  return { code, message };
}
