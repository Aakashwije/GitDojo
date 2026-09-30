import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import { failure, gitError, notARepository, success } from "../engine/errors";
import { type GitCommitInfo, type GitLogOptions, type GitLogResult } from "../engine/git-engine";
import {
  currentBranch,
  isRepository,
  readCommitsFromHead,
  resolveRefOrNull,
} from "../engine/repository";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats like Git's default date format, in the author's recorded timezone (not the viewer's). */
export function formatGitDate(timestamp: number, timezoneOffset: number): string {
  const local = new Date((timestamp - timezoneOffset * 60) * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const sign = timezoneOffset <= 0 ? "+" : "-";
  const absolute = Math.abs(timezoneOffset);
  const zone = `${sign}${pad(Math.floor(absolute / 60))}${pad(absolute % 60)}`;
  const time = `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`;
  return `${WEEKDAYS[local.getUTCDay()] ?? ""} ${MONTHS[local.getUTCMonth()] ?? ""} ${String(local.getUTCDate())} ${time} ${String(local.getUTCFullYear())} ${zone}`;
}

async function branchDecorations(ctx: GitContext): Promise<Map<string, string[]>> {
  const decorations = new Map<string, string[]>();
  const head = await currentBranch(ctx);
  const branches = await git.listBranches({ fs: ctx.fs, dir: ctx.dir });
  // HEAD's branch is listed first, as Git does.
  const ordered = head ? [head, ...branches.filter((name) => name !== head)] : branches;
  for (const name of ordered) {
    const oid = await resolveRefOrNull(ctx, name);
    if (oid === null) continue;
    const label = name === head ? `HEAD -> ${name}` : name;
    decorations.set(oid, [...(decorations.get(oid) ?? []), label]);
  }
  return decorations;
}

function formatCommit(commit: GitCommitInfo, decoration: string, oneline: boolean): string {
  if (oneline) return `${commit.shortOid}${decoration} ${commit.message.split("\n")[0] ?? ""}`;
  const body = commit.message
    .split("\n")
    .map((line) => (line === "" ? "" : `    ${line}`))
    .join("\n");
  return [
    `commit ${commit.oid}${decoration}`,
    ...(commit.parents.length > 1
      ? [`Merge: ${commit.parents.map((parent) => parent.slice(0, 7)).join(" ")}`]
      : []),
    `Author: ${commit.author.name} <${commit.author.email}>`,
    `Date:   ${formatGitDate(commit.author.timestamp, commit.author.timezoneOffset)}`,
    "",
    body,
  ].join("\n");
}

export async function runLog(ctx: GitContext, options: GitLogOptions = {}): Promise<GitLogResult> {
  if (!(await isRepository(ctx))) return notARepository();
  if ((await resolveRefOrNull(ctx, "HEAD")) === null) {
    const branch = (await currentBranch(ctx)) ?? "HEAD";
    return failure(
      gitError(
        "NO_COMMITS",
        `fatal: your current branch '${branch}' does not have any commits yet`,
      ),
    );
  }

  const commits = await readCommitsFromHead(ctx);
  const decorations = await branchDecorations(ctx);
  const oneline = options.oneline ?? false;
  const output = commits
    .map((commit) => {
      const labels = decorations.get(commit.oid);
      const decoration = labels ? ` (${labels.join(", ")})` : "";
      return formatCommit(commit, decoration, oneline);
    })
    .join(oneline ? "\n" : "\n\n");

  return success(output, { commits });
}
