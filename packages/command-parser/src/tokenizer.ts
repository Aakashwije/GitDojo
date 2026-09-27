import { parseError, type ParseError } from "./errors";

export type TokenizeResult = { ok: true; tokens: string[] } | { ok: false; error: ParseError };

const WHITESPACE = /\s/;
/** Characters a backslash may escape inside double quotes, as in POSIX shells. */
const DOUBLE_QUOTE_ESCAPABLE = new Set(['"', "\\", "$", "`"]);

/**
 * Splits a command line into words using a small, predictable subset of shell quoting rules:
 * whitespace separates words, single quotes are literal, double quotes allow `\"` escapes,
 * a backslash outside quotes escapes the next character, and adjacent quoted parts join
 * (`-m"Initial commit"` → `-mInitial commit`). No expansion or substitution ever happens.
 */
export function tokenize(input: string): TokenizeResult {
  const tokens: string[] = [];
  let current = "";
  // Tracks whether a word has started, so `""` still yields an (empty) token.
  let inWord = false;
  let index = 0;

  const pushWord = () => {
    if (inWord) tokens.push(current);
    current = "";
    inWord = false;
  };

  while (index < input.length) {
    const char = input.charAt(index);

    if (WHITESPACE.test(char)) {
      pushWord();
      index += 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const close = findClosingQuote(input, index + 1, char);
      if (close === -1) {
        return {
          ok: false,
          error: parseError(
            "MALFORMED_QUOTES",
            `error: unterminated ${char === '"' ? "double" : "single"} quote. Close it with ${char}`,
          ),
        };
      }
      const content = input.slice(index + 1, close);
      current += char === '"' ? unescapeDoubleQuoted(content) : content;
      inWord = true;
      index = close + 1;
      continue;
    }

    if (char === "\\" && index + 1 < input.length) {
      current += input.charAt(index + 1);
      inWord = true;
      index += 2;
      continue;
    }

    current += char;
    inWord = true;
    index += 1;
  }

  pushWord();
  return { ok: true, tokens };
}

function findClosingQuote(input: string, from: number, quote: string): number {
  for (let index = from; index < input.length; index += 1) {
    const char = input.charAt(index);
    if (quote === '"' && char === "\\") {
      index += 1;
      continue;
    }
    if (char === quote) return index;
  }
  return -1;
}

function unescapeDoubleQuoted(content: string): string {
  let result = "";
  for (let index = 0; index < content.length; index += 1) {
    const char = content.charAt(index);
    const next = content.charAt(index + 1);
    if (char === "\\" && DOUBLE_QUOTE_ESCAPABLE.has(next)) {
      result += next;
      index += 1;
    } else {
      result += char;
    }
  }
  return result;
}
