import { ansi } from "./ansi";

type StatusSection = "staged" | "unstaged" | null;

function sectionFor(line: string, current: StatusSection): StatusSection {
  if (line.startsWith("Changes to be committed:")) return "staged";
  if (
    line.startsWith("Changes not staged for commit:") ||
    line.startsWith("Untracked files:") ||
    line.startsWith("Unmerged paths:")
  ) {
    return "unstaged";
  }
  return line === "" ? current : line.startsWith("\t") || line.startsWith("  (") ? current : null;
}

function highlightDecoration(decoration: string): string {
  // "(HEAD -> main, feature)" → HEAD in accent, branch names in orange.
  const inner = decoration
    .slice(1, -1)
    .split(", ")
    .map((label) =>
      label.startsWith("HEAD -> ")
        ? `${ansi.accent(ansi.bold("HEAD ->"))} ${ansi.branch(ansi.bold(label.slice(8)))}`
        : ansi.branch(ansi.bold(label)),
    )
    .join(ansi.warning(", "));
  return `${ansi.warning("(")}${inner}${ansi.warning(")")}`;
}

function highlightLine(line: string, section: StatusSection, ok: boolean): string {
  if (/^(fatal|error):/.test(line)) return ansi.error(line);
  if (line.startsWith("hint:") || line.startsWith("warning:")) return ansi.warning(line);
  // git merge: conflicts in red, the failure summary too.
  if (line.startsWith("CONFLICT (") || line.startsWith("Automatic merge failed")) {
    return ansi.error(line);
  }
  if (
    line === "Fast-forward" ||
    line.startsWith("Merge made by") ||
    line.startsWith("Successfully rebased") ||
    line.startsWith("Saved working directory") ||
    line.startsWith("HEAD is now at")
  ) {
    return ansi.success(line);
  }
  if (line.startsWith("Could not apply") || line.startsWith("Warning: you are leaving")) {
    return ansi.error(line);
  }
  if (line.startsWith("Dropped refs/stash")) return ansi.muted(line);
  // `git stash list`: stash@{0}: WIP on main: ...
  const stash = /^(stash@\{\d+\}): (.*)$/.exec(line);
  if (stash && ok) return `${ansi.accent(stash[1] ?? "")}: ${stash[2] ?? ""}`;
  const reflog = ok ? highlightReflogLine(line) : null;
  if (reflog) return reflog;
  // Diffstat bars: " login.js | 5 +++--"
  const stat = /^( .+ \| +\d+ )(\+*)(-*)$/.exec(line);
  if (stat) {
    const [, head = "", plus = "", minus = ""] = stat;
    return `${head}${ansi.success(plus)}${ansi.error(minus)}`;
  }
  if (line.endsWith(": command not found") || line.endsWith("is not a git command.")) {
    return ansi.error(line);
  }

  // git status entries: staged in green, unstaged/untracked in red (Git's own convention).
  if (line.startsWith("\t") && section !== null) {
    return section === "staged" ? ansi.success(line) : ansi.error(line);
  }

  // git log: "commit <oid> (HEAD -> main)"
  const commitMatch = /^commit ([0-9a-f]{40})( \(.+\))?$/.exec(line);
  if (commitMatch) {
    const [, oid = "", decoration] = commitMatch;
    return `${ansi.warning(`commit ${oid}`)}${decoration ? ` ${highlightDecoration(decoration.trim())}` : ""}`;
  }

  // git log --oneline: "<short> (HEAD -> main) message"
  const onelineMatch = /^([0-9a-f]{7})( \([^)]+\))? (.*)$/.exec(line);
  if (onelineMatch && ok) {
    const [, short = "", decoration, message = ""] = onelineMatch;
    return `${ansi.warning(short)}${decoration ? ` ${highlightDecoration(decoration.trim())}` : ""} ${message}`;
  }

  return line;
}

/** `git diff`: file headers bold, hunk headers blue, additions green, removals red. */
function highlightDiffLine(line: string): string {
  if (/^(diff --git |index |new file mode |deleted file mode |--- |\+\+\+ )/.test(line)) {
    return ansi.bold(line);
  }
  if (line.startsWith("@@")) {
    const match = /^(@@ [^@]+ @@)(.*)$/.exec(line);
    return match ? `${ansi.path(match[1] ?? "")}${match[2] ?? ""}` : ansi.path(line);
  }
  if (line.startsWith("+")) return ansi.success(line);
  if (line.startsWith("-")) return ansi.error(line);
  if (line.startsWith("\\ ")) return ansi.muted(line);
  return line;
}

/** `git reflog`: `abc1234 (HEAD -> main) HEAD@{0}: commit: message`. */
function highlightReflogLine(line: string): string | null {
  const match = /^([0-9a-f]{7})( \([^)]+\))? (\S+@\{\d+\}): (.*)$/.exec(line);
  if (!match) return null;
  const [, short = "", decoration, selector = "", message = ""] = match;
  return `${ansi.warning(short)}${decoration ? ` ${highlightDecoration(decoration.trim())}` : ""} ${ansi.accent(selector)}: ${message}`;
}

/** Adds Git-like colors to plain command output. Output text itself is never changed. */
export function highlightOutput(output: string, ok: boolean): string {
  if (/^diff --git /m.test(output)) {
    return output.split("\n").map(highlightDiffLine).join("\n");
  }
  let section: StatusSection = null;
  return output
    .split("\n")
    .map((line) => {
      section = sectionFor(line, section);
      return highlightLine(line, section, ok);
    })
    .join("\n");
}
