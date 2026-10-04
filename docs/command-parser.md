# Command parser

`@gitdojo/command-parser` turns one line of terminal input into a `ParsedCommand` and routes it to
the Git engine. It is the only way input reaches Git: the terminal has no command logic of its
own, and nothing ever reaches an operating-system shell.

```text
"git reset --hard HEAD~1"
   ↓ tokenize      ["git", "reset", "--hard", "HEAD~1"]
   ↓ parseCommand  { program: "git", command: "reset", flags: { hard: true }, args: ["HEAD~1"] }
   ↓ executeCommand → GitEngine.reset({ mode: "hard", commit: "HEAD~1" })
   ↓ CommandExecutionResult { ok, output, errorCode? }
```

## Tokenizer

`tokenize` implements a small, predictable subset of shell quoting: whitespace separates words,
single quotes are literal, double quotes allow `\"`, a backslash escapes the next character, and
adjacent quoted parts join (`-m"Initial commit"`). There is **no** expansion of any kind: no
variables, globs, `~`, command substitution, pipes or redirection. An unterminated quote is an
error, not a prompt for more input.

## Parser

`parseCommand(raw)` never throws. It returns `{ ok: true, command }` or `{ ok: false, error }`
with a Git-like message and a `ParseErrorCode`:

| Code                      | Example                | Message                                                 |
| ------------------------- | ---------------------- | ------------------------------------------------------- |
| `UNSUPPORTED_PROGRAM`     | `ls`                   | `ls: command not found` (+ a pointer to `help`)         |
| `MISSING_GIT_COMMAND`     | `git`                  | The list of supported commands                          |
| `UNSUPPORTED_GIT_COMMAND` | `git push`, `git frob` | `not available in GitDojo yet` / `is not a git command` |
| `UNKNOWN_FLAG`            | `git status --short`   | `error: unknown option '--short'` + usage               |
| `MISSING_FLAG_VALUE`      | `git commit -m`        | `error: switch 'm' requires a value`                    |
| `UNEXPECTED_ARGUMENT`     | `git branch a b c`     | `error: unexpected argument 'c'` + usage                |
| `MALFORMED_QUOTES`        | `git commit -m "oops`  | `error: unterminated double quote`                      |

Commands are declared in `GIT_COMMAND_SPECS` (`src/commands.ts`): name, summary, usage, flags and
how many positional arguments are allowed. Flags support:

- long (`--staged`) and short (`-S`) names, with aliases (`--cached` = `--staged`);
- values attached (`-mmsg`, `--source=HEAD`) or as the next word (`-m msg`);
- bundled short flags (`-rf` = `-r -f`); only the last of a bundle may take a value (`-um msg`);
- repeated values joined by a separator (`-m a -m b` → two paragraphs).

`--` ends options. Everything after it is an argument, and `ParsedCommand.pathsFrom` records
where it appeared, so commands can tell paths from revisions (`git reset HEAD~1 -- README.md`).

`help` and `clear` are terminal built-ins. They are parsed and routed like everything else.

## Router

`executeCommand(parsed, { git })` maps each supported command to `GitEngine` calls
(`src/router/router.ts`). The router interprets flag combinations (`git stash pop` vs
`git stash list`, `--continue` / `--abort` / `--skip`, `git checkout <commit>` detaching HEAD)
but contains no Git logic of its own. It never rejects: unexpected errors become
`fatal: something went wrong while running that command.` with error code `INTERNAL`, and the
real error goes to the developer console only.

`runCommandLine(raw, context)` parses and executes in one step; that is what the terminal and
lesson setup `commands` use.

## Supported commands

`init`, `status`, `add`, `commit`, `log`, `branch`, `switch`, `checkout`, `merge`, `diff`,
`restore`, `rm`, `reset`, `revert`, `stash`, `cherry-pick`, `reflog`, `rebase`. `help` in the
terminal lists them with their usage; see [git-engine.md](./git-engine.md) for behaviour.

## Adding a command

1. Add a spec to `GIT_COMMAND_SPECS` and remove the name from `PLANNED_GIT_COMMANDS`.
2. Implement it in the Git engine (see [git-engine.md](./git-engine.md#adding-a-git-command)).
3. Add a handler to `gitHandlers` in the router; the compiler requires one per spec.
4. Add parser tests (`src/parser.test.ts`) and router tests (`src/router/router.test.ts`).

Challenges that list the command in `requires` unlock automatically.
