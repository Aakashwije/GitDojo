import git from "isomorphic-git";
import { type GitContext } from "../engine/context";
import {
  cleanMessage,
  clearEditorRecord,
  readEditorRecord,
  WAITING_FOR_EDITOR,
  writeEditorRecord,
  type EditorRecord,
} from "../engine/editor-state";
import { failure, gitError, notARepository, success } from "../engine/errors";
import {
  DEFAULT_AUTHOR,
  type GitCommitInfo,
  type GitRebaseOptions,
  type GitRebaseResult,
  type GitSequencerAction,
} from "../engine/git-engine";
import {
  clearMergeState,
  operationInProgressMessage,
  operationKind,
  readMergeState,
  rebaseStep,
  unresolvedConflicts,
  writeMergeState,
  type MergeStateRecord,
  type RebaseAction,
  type RebaseRecord,
  type RebaseStep,
} from "../engine/merge-state";
import { logBranchMove, logHeadMove } from "../engine/reflog";
import {
  currentBranch,
  isAncestor,
  isRepository,
  readCommitsFrom,
  resolveRefOrNull,
  shortOid,
  subject,
  topologicalOrder,
} from "../engine/repository";
import { resolveRevision } from "../engine/revisions";
import { hasStagedChanges, readStatusEntries } from "../engine/status-matrix";
import { applyWorkingTreeUpdates } from "../engine/working-tree";
import { commitPick, preparePick, type PreparedPick } from "./pick";
import { forceCheckout } from "./reset";
import { checkoutCommit } from "./switch";

export const REBASE_USAGE =
  "usage: git rebase [-i] <upstream>\n   or: git rebase (--continue | --skip | --abort)";

const NO_REBASE = "fatal: No rebase in progress?";

async function attachHead(ctx: GitContext, branch: string): Promise<void> {
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: "HEAD",
    value: `refs/heads/${branch}`,
    symbolic: true,
    force: true,
  });
}

async function detachAt(ctx: GitContext, oid: string): Promise<void> {
  await git.writeRef({ fs: ctx.fs, dir: ctx.dir, ref: "HEAD", value: oid, force: true });
}

/** The branch's own commits (not reachable from `onto`), oldest first. Merges are dropped. */
async function commitsToReplay(
  ctx: GitContext,
  head: string,
  onto: string,
): Promise<GitCommitInfo[]> {
  const ontoHistory = new Set((await readCommitsFrom(ctx, [onto])).map((commit) => commit.oid));
  const own = (await readCommitsFrom(ctx, [head])).filter(
    (commit: GitCommitInfo) => !ontoHistory.has(commit.oid) && commit.parents.length <= 1,
  );
  return topologicalOrder(own).reverse();
}

/** Points the rebased branch at where HEAD ended up and attaches HEAD to it again. */
async function finish(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) throw new Error("rebase lost HEAD");
  await git.writeRef({
    fs: ctx.fs,
    dir: ctx.dir,
    ref: `refs/heads/${rebase.branch}`,
    value: head,
    force: true,
  });
  await logBranchMove(ctx, rebase.branch, {
    from: rebase.originalHead,
    to: head,
    message: `rebase (finish): refs/heads/${rebase.branch} onto ${rebase.onto}`,
  });
  await attachHead(ctx, rebase.branch);
  await logHeadMove(ctx, {
    from: head,
    to: head,
    message: `rebase (finish): returning to refs/heads/${rebase.branch}`,
  });
  await clearMergeState(ctx);
  await clearEditorRecord(ctx);
  return success(`Successfully rebased and updated refs/heads/${rebase.branch}.`, {
    status: "rebased",
    oid: head,
  });
}

/** Rewrites HEAD's commit (detached, mid-rebase) with the index and `message`; same parents. */
async function amendHead(
  ctx: GitContext,
  message: string,
  reflogMessage: string,
  { keepTree = false }: { keepTree?: boolean } = {},
): Promise<string> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) throw new Error("rebase lost HEAD");
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: head });
  // The amended commit keeps its original author; the learner is the committer.
  const oid = await git.commit({
    fs: ctx.fs,
    dir: ctx.dir,
    message,
    author: commit.author,
    committer: DEFAULT_AUTHOR,
    parent: commit.parent,
    ...(keepTree ? { tree: commit.tree } : {}),
  });
  await logHeadMove(ctx, { from: head, to: oid, message: reflogMessage });
  return oid;
}

async function headMessage(ctx: GitContext): Promise<string> {
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (head === null) return "";
  return (await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid: head })).commit.message.trimEnd();
}

const ORDINALS = ["1st", "2nd", "3rd"];

function ordinal(index: number): string {
  return ORDINALS[index] ?? `${String(index + 1)}th`;
}

/** What Git puts in the editor for a squash chain: every message, skipped ones commented out. */
function squashTemplate(rebase: RebaseRecord): string {
  const messages = rebase.chain?.messages ?? [];
  const blocks = messages.map((message, index) => {
    const label =
      index === 0
        ? `# This is the ${ordinal(0)} commit message:`
        : message.skip
          ? `# The commit message #${String(index + 1)} will be skipped:`
          : `# This is the commit message #${String(index + 1)}:`;
    const body = message.skip
      ? message.text
          .split("\n")
          .map((line) => `# ${line}`)
          .join("\n")
      : message.text;
    return `${label}\n\n${body}`;
  });
  return [
    `# This is a combination of ${String(messages.length)} commits.`,
    ...blocks,
    messageHelp(rebase),
  ].join("\n\n");
}

function messageHelp(rebase: RebaseRecord): string {
  return [
    "# Please enter the commit message for your changes. Lines starting",
    "# with '#' will be ignored, and an empty message aborts the commit.",
    "#",
    `# interactive rebase in progress; onto ${shortOid(rebase.onto)}`,
    "",
  ].join("\n");
}

/** Stops the rebase until the learner saves a commit message in the editor. */
async function waitForMessage(
  ctx: GitContext,
  rebase: RebaseRecord,
  reason: "reword" | "squash",
  report: string[],
): Promise<GitRebaseResult> {
  const content =
    reason === "squash"
      ? squashTemplate(rebase)
      : `${await headMessage(ctx)}\n\n${messageHelp(rebase)}`;
  await writeEditorRecord(ctx, {
    purpose: "message",
    file: "COMMIT_EDITMSG",
    content,
    rebase,
    reason,
  });
  return success([...report, WAITING_FOR_EDITOR].join("\n"), { status: "editing" });
}

/**
 * Records the step whose changes are in the index: a new commit for pick/reword, or folded into
 * HEAD's commit for squash/fixup. Returns a result when the rebase has to stop for the editor.
 */
async function commitStep(
  ctx: GitContext,
  rebase: RebaseRecord,
  action: RebaseAction,
  pick: Pick<PreparedPick, "message" | "author">,
  report: string[],
): Promise<GitRebaseResult | null> {
  const title = subject(pick.message);
  if (action === "pick" || action === "reword") {
    await commitPick(ctx, pick, `rebase (pick): ${title}`);
    delete rebase.chain;
    return action === "reword" ? waitForMessage(ctx, rebase, "reword", report) : null;
  }
  // squash / fixup: meld into the previous commit, keeping its message for now.
  const chain = (rebase.chain ??= {
    messages: [{ text: await headMessage(ctx), skip: false }],
    squash: false,
  });
  chain.messages.push({ text: pick.message, skip: action === "fixup" });
  if (action === "squash") chain.squash = true;
  await amendHead(ctx, chain.messages[0]?.text ?? pick.message, `rebase (${action}): ${title}`);
  return endOfChain(ctx, rebase, report);
}

/** After a squash or fixup: if the chain ends here and had a squash, ask for the message. */
async function endOfChain(
  ctx: GitContext,
  rebase: RebaseRecord,
  report: string[],
): Promise<GitRebaseResult | null> {
  const next = rebase.todo[0];
  const continues = next !== undefined && ["squash", "fixup"].includes(rebaseStep(next).action);
  if (continues || !rebase.chain) return null;
  if (rebase.chain.squash) return waitForMessage(ctx, rebase, "squash", report);
  delete rebase.chain;
  return null;
}

async function parentOf(ctx: GitContext, oid: string): Promise<string | null> {
  const { commit } = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
  return commit.parent.length === 1 ? (commit.parent[0] ?? null) : null;
}

/**
 * Replays `rebase.todo` one step at a time on top of HEAD. Stops at the first conflict or editor,
 * saving where it is so the rebase can pick up from there; finishes the rebase otherwise.
 */
async function replay(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  const report: string[] = [];
  for (let next = rebase.todo.shift(); next !== undefined; next = rebase.todo.shift()) {
    const { action, oid } = rebaseStep(next);
    const head = await resolveRefOrNull(ctx, "HEAD");

    // An interactive rebase keeps commits it does not need to change, as Git does.
    if (rebase.interactive && (action === "pick" || action === "reword") && head !== null) {
      if ((await parentOf(ctx, oid)) === head) {
        const moved = await checkoutCommit(ctx, head, oid);
        if (!moved.ok) return failure(moved.error);
        await detachAt(ctx, oid);
        await logHeadMove(ctx, {
          from: head,
          to: oid,
          message: `rebase (pick): ${await commitTitle(ctx, oid)}`,
        });
        delete rebase.chain;
        if (action === "reword") return waitForMessage(ctx, rebase, "reword", report);
        continue;
      }
    }

    const prepared = await preparePick(ctx, "rebase", oid);
    if (!prepared.ok) return failure(prepared.error);
    const { pick } = prepared;
    // A commit whose changes `onto` already has adds nothing: Git drops it. A squash or fixup
    // still folds its message into the chain.
    if (pick.merged.updates.length === 0 && (action === "pick" || action === "reword")) continue;
    await applyWorkingTreeUpdates(ctx, pick.merged.updates);
    if (pick.merged.conflicts.length > 0) {
      const state: MergeStateRecord = {
        kind: "rebase",
        branch: pick.label,
        theirs: oid,
        ours: head ?? rebase.onto,
        message: pick.message,
        ...(pick.author ? { author: pick.author } : {}),
        conflicts: pick.merged.conflicts,
        touched: pick.merged.updates.map((update) => update.path),
        rebase: {
          ...rebase,
          current: oid,
          ...(rebase.interactive ? { currentAction: action } : {}),
        },
      };
      await writeMergeState(ctx, state);
      const line = `Could not apply ${shortOid(oid)}... ${subject(pick.message)}`;
      const output = [
        ...report,
        ...pick.merged.report,
        `error: could not apply ${shortOid(oid)}... ${subject(pick.message)}`,
        "hint: Resolve all conflicts manually, mark them as resolved with",
        'hint: "git add/rm <conflicted_files>", then run "git rebase --continue".',
        'hint: You can instead skip this commit: run "git rebase --skip".',
        'hint: To abort and get back to the state before "git rebase", run "git rebase --abort".',
        line,
      ].join("\n");
      return {
        ok: false,
        output,
        data: { status: "conflict", conflicts: pick.merged.conflicts.map((c) => c.path) },
        error: gitError("MERGE_CONFLICT", output),
      };
    }
    const stopped = await commitStep(ctx, rebase, action, pick, report);
    if (stopped) return stopped;
  }
  return finish(ctx, rebase);
}

async function commitTitle(ctx: GitContext, oid: string): Promise<string> {
  return subject((await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid })).commit.message);
}

/** The todo list Git opens for `git rebase -i`, with its help text. */
async function todoTemplate(
  ctx: GitContext,
  commits: GitCommitInfo[],
  head: string,
  onto: string,
): Promise<string> {
  const lines =
    commits.length === 0
      ? ["noop"]
      : await Promise.all(
          commits.map(
            async (commit) => `pick ${commit.shortOid} ${await commitTitle(ctx, commit.oid)}`,
          ),
        );
  const count = commits.length;
  return [
    ...lines,
    "",
    `# Rebase ${shortOid(onto)}..${shortOid(head)} onto ${shortOid(onto)} (${String(count)} command${count === 1 ? "" : "s"})`,
    "#",
    "# Commands:",
    "# p, pick <commit> = use commit",
    "# r, reword <commit> = use commit, but edit the commit message",
    "# s, squash <commit> = use commit, but meld into previous commit",
    '# f, fixup <commit> = like "squash", but keep only the previous',
    "#                    commit's log message",
    "# d, drop <commit> = remove commit",
    "#",
    "# These lines can be re-ordered; they are executed from top to bottom.",
    "#",
    "# If you remove a line here THAT COMMIT WILL BE LOST.",
    "#",
    "# However, if you remove everything, the rebase will be aborted.",
    "#",
    "# GitDojo supports pick, reword, squash, fixup and drop.",
    "",
  ].join("\n");
}

const TODO_ACTIONS: Record<string, RebaseAction | "drop" | "noop"> = {
  p: "pick",
  pick: "pick",
  r: "reword",
  reword: "reword",
  s: "squash",
  squash: "squash",
  f: "fixup",
  fixup: "fixup",
  d: "drop",
  drop: "drop",
  noop: "noop",
};

/** Real todo commands GitDojo cannot run: they get a clear "not supported" instead. */
const UNSUPPORTED_ACTIONS: Record<string, string> = {
  e: "edit",
  edit: "edit",
  x: "exec",
  exec: "exec",
  b: "break",
  break: "break",
  l: "label",
  label: "label",
  t: "reset",
  reset: "reset",
  m: "merge",
  merge: "merge",
  u: "update-ref",
  "update-ref": "update-ref",
};

/** Parses an edited todo list into steps (drops removed), or says what is wrong with it. */
async function parseTodo(
  ctx: GitContext,
  content: string,
): Promise<{ ok: true; steps: RebaseStep[] } | { ok: false; message: string }> {
  const steps: RebaseStep[] = [];
  const lines = content.split("\n");
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [word = "", target] = line.split(/\s+/);
    const unsupported = UNSUPPORTED_ACTIONS[word];
    if (unsupported !== undefined) {
      return {
        ok: false,
        message: `error: GitDojo does not support '${unsupported}' in an interactive rebase yet (line ${String(index + 1)}).\nhint: Use pick, reword, squash, fixup or drop.`,
      };
    }
    const action = TODO_ACTIONS[word];
    if (action === undefined) {
      return { ok: false, message: `error: invalid line ${String(index + 1)}: ${line}` };
    }
    if (action === "noop") continue;
    if (target === undefined) {
      return {
        ok: false,
        message: `error: missing arguments for ${action} (line ${String(index + 1)})`,
      };
    }
    if (target.startsWith("-")) {
      return {
        ok: false,
        message: `error: GitDojo does not support '${word} ${target}' yet (line ${String(index + 1)}).`,
      };
    }
    const oid = await resolveRevision(ctx, target);
    if (oid === null) {
      return {
        ok: false,
        message: `error: invalid line ${String(index + 1)}: ${line}\nerror: could not parse '${target}'`,
      };
    }
    if (action === "drop") continue;
    if ((action === "squash" || action === "fixup") && steps.length === 0) {
      return { ok: false, message: `error: cannot '${action}' without a previous commit` };
    }
    steps.push({ action, oid });
  }
  return { ok: true, steps };
}

/** Why `git rebase` cannot start right now, or `null` (with the branch and HEAD) when it can. */
async function rebasePreconditions(
  ctx: GitContext,
): Promise<{ ok: false; result: GitRebaseResult } | { ok: true; branch: string; head: string }> {
  const inProgress = await readMergeState(ctx);
  if (inProgress) {
    return {
      ok: false,
      result: failure(gitError("OPERATION_IN_PROGRESS", operationInProgressMessage(inProgress))),
    };
  }
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (branch === null || head === null) {
    return {
      ok: false,
      result: failure(
        gitError(
          "NOT_ON_BRANCH",
          branch === null
            ? "fatal: You are not currently on a branch.\nhint: GitDojo rebases branches: switch to one first."
            : `fatal: your current branch '${branch}' does not have any commits yet`,
        ),
      ),
    };
  }
  const status = await readStatusEntries(ctx);
  if (hasStagedChanges(status)) {
    return {
      ok: false,
      result: failure(
        gitError(
          "LOCAL_CHANGES",
          "error: cannot rebase: Your index contains uncommitted changes.\nerror: Please commit or stash them.",
        ),
      ),
    };
  }
  if (status.some((entry) => entry.unstaged === "modified" || entry.unstaged === "deleted")) {
    return {
      ok: false,
      result: failure(
        gitError(
          "LOCAL_CHANGES",
          "error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.",
        ),
      ),
    };
  }
  return { ok: true, branch, head };
}

/**
 * `git rebase <upstream>`: replays the current branch's own commits on top of `upstream`.
 * `git rebase -i <upstream>`: first waits for the learner to edit the todo list.
 */
export async function runRebase(
  ctx: GitContext,
  upstream: string,
  { interactive = false }: GitRebaseOptions = {},
): Promise<GitRebaseResult> {
  if (upstream === "") return failure(gitError("INVALID_ARGUMENT", REBASE_USAGE));
  if (!(await isRepository(ctx))) return notARepository();
  const ready = await rebasePreconditions(ctx);
  if (!ready.ok) return ready.result;
  const { branch, head } = ready;
  const onto = await resolveRevision(ctx, upstream);
  if (onto === null) {
    return failure(gitError("INVALID_REVISION", `fatal: invalid upstream '${upstream}'`));
  }

  if (interactive) {
    const commits = await commitsToReplay(ctx, head, onto);
    await writeEditorRecord(ctx, {
      purpose: "todo",
      file: "git-rebase-todo",
      content: await todoTemplate(ctx, commits, head, onto),
      upstream,
      rebase: {
        branch,
        originalHead: head,
        onto,
        todo: commits.map((commit) => commit.oid),
        current: null,
        interactive: true,
      },
    });
    return success(WAITING_FOR_EDITOR, { status: "editing" });
  }

  if (await isAncestor(ctx, onto, head)) {
    return success(`Current branch ${branch} is up to date.`, { status: "up-to-date", oid: head });
  }

  const start = await checkoutCommit(ctx, head, onto);
  if (!start.ok) return failure(start.error);
  await detachAt(ctx, onto);
  await logHeadMove(ctx, { from: head, to: onto, message: `rebase (start): checkout ${upstream}` });

  const rebase: RebaseRecord = {
    branch,
    originalHead: head,
    onto,
    todo: (await commitsToReplay(ctx, head, onto)).map((commit) => commit.oid),
    current: null,
  };
  // The branch has nothing of its own: it simply catches up (a fast-forward).
  if (rebase.todo.length === 0) {
    const finished = await finish(ctx, rebase);
    return finished.ok ? { ...finished, data: { status: "fast-forward", oid: onto } } : finished;
  }
  return replay(ctx, rebase);
}

/** Keeps the editor open with the learner's text and says why it could not be closed. */
async function refuseEditor(
  ctx: GitContext,
  record: EditorRecord,
  content: string,
  message: string,
): Promise<GitRebaseResult> {
  const hint = 'hint: Fix it and save again, or run "git rebase --abort" to cancel.';
  await writeEditorRecord(ctx, { ...record, content, error: message });
  return {
    ok: false,
    output: `${message}\n${hint}`,
    data: { status: "editing" },
    error: gitError(
      record.purpose === "todo" ? "INVALID_TODO" : "INVALID_ARGUMENT",
      `${message}\n${hint}`,
    ),
  };
}

/** The learner saved and closed the file Git was waiting for. */
export async function runCloseEditor(ctx: GitContext, content: string): Promise<GitRebaseResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const record = await readEditorRecord(ctx);
  if (record === null) {
    return failure(gitError("NO_OPERATION", "error: Git is not waiting for an editor."));
  }
  const rebase: RebaseRecord = { ...record.rebase, todo: [...record.rebase.todo] };

  if (record.purpose === "message") {
    const message = cleanMessage(content);
    if (message === "") {
      return refuseEditor(ctx, record, content, "Aborting commit due to empty commit message.");
    }
    await clearEditorRecord(ctx);
    await amendHead(ctx, message, `rebase (${record.reason ?? "reword"}): ${subject(message)}`, {
      keepTree: true,
    });
    delete rebase.chain;
    return replay(ctx, rebase);
  }

  const parsed = await parseTodo(ctx, content);
  if (!parsed.ok) return refuseEditor(ctx, record, content, parsed.message);
  await clearEditorRecord(ctx);
  if (parsed.steps.length === 0) return success("Nothing to do", { status: "nothing" });

  // Nothing may have moved while the editor was open; if it did, the plan no longer applies.
  const branch = await currentBranch(ctx);
  const head = await resolveRefOrNull(ctx, "HEAD");
  if (branch !== rebase.branch || head !== rebase.originalHead) {
    return failure(
      gitError("NO_OPERATION", "error: HEAD moved while the editor was open; rebase aborted."),
    );
  }
  const start = await checkoutCommit(ctx, head, rebase.onto);
  if (!start.ok) return failure(start.error);
  await detachAt(ctx, rebase.onto);
  await logHeadMove(ctx, {
    from: head,
    to: rebase.onto,
    message: `rebase (start): checkout ${record.upstream ?? shortOid(rebase.onto)}`,
  });
  return replay(ctx, { ...rebase, todo: parsed.steps });
}

/** Undoes a rebase completely: the branch never moved, so HEAD simply goes back to it. */
async function abortRebase(ctx: GitContext, rebase: RebaseRecord): Promise<GitRebaseResult> {
  await forceCheckout(ctx, rebase.originalHead);
  const head = await resolveRefOrNull(ctx, "HEAD");
  await clearMergeState(ctx);
  await clearEditorRecord(ctx);
  await attachHead(ctx, rebase.branch);
  await logHeadMove(ctx, {
    from: head,
    to: rebase.originalHead,
    message: `rebase (abort): returning to refs/heads/${rebase.branch}`,
  });
  return success("", { status: "aborted", oid: rebase.originalHead });
}

/** `git rebase --continue | --skip | --abort`. */
export async function runRebaseControl(
  ctx: GitContext,
  action: GitSequencerAction,
): Promise<GitRebaseResult> {
  if (!(await isRepository(ctx))) return notARepository();
  const editor = await readEditorRecord(ctx);
  if (editor) {
    if (action === "abort") {
      // Waiting for the todo list: nothing has happened yet, so there is nothing to undo.
      if (editor.purpose === "todo") {
        await clearEditorRecord(ctx);
        return success("", { status: "aborted", oid: editor.rebase.originalHead });
      }
      return abortRebase(ctx, editor.rebase);
    }
    return failure(
      gitError(
        "EDITOR_OPEN",
        `error: Git is waiting for you to close the editor (${editor.file}).\nhint: Save and close it to go on, or run "git rebase --abort".`,
      ),
    );
  }

  const state = await readMergeState(ctx);
  if (!state?.rebase || operationKind(state) !== "rebase") {
    return failure(gitError("NO_OPERATION", NO_REBASE));
  }
  const rebase: RebaseRecord = { ...state.rebase, todo: [...state.rebase.todo] };

  if (action === "abort") return abortRebase(ctx, rebase);

  if (action === "skip") {
    // Drop the stopped commit: back to HEAD, then on with the rest.
    await forceCheckout(ctx, await resolveRefOrNull(ctx, "HEAD"));
    await clearMergeState(ctx);
    const next: RebaseRecord = { ...rebase, current: null };
    delete next.currentAction;
    return replay(ctx, next);
  }

  if (unresolvedConflicts(state).length > 0) {
    return failure(
      gitError(
        "UNRESOLVED_CONFLICTS",
        "error: you must edit all merge conflicts and then\nmark them as resolved using git add",
      ),
    );
  }
  await clearMergeState(ctx);
  const next: RebaseRecord = { ...rebase, current: null };
  delete next.currentAction;
  // The stopped commit, unless `git commit` already recorded it.
  if (rebase.current !== null && hasStagedChanges(await readStatusEntries(ctx))) {
    const stopped = await commitStep(ctx, next, rebase.currentAction ?? "pick", state, []);
    if (stopped) return stopped;
  }
  return replay(ctx, next);
}
