import { describe, expect, it } from "vitest";
import { createTestWorkspace, type TestWorkspace } from "../test-utils/create-test-workspace";

async function commit(ws: TestWorkspace, message: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    await ws.files.writeFile(ws.workspaceId, path, content);
  }
  await ws.git.add(Object.keys(files));
  const result = await ws.git.commit({ message });
  expect(result.ok, result.output).toBe(true);
  return result.data?.oid ?? "";
}

/** main: Initial commit; feature: Add search, Fix typo, Add debug logging, wip. */
async function repo() {
  const ws = await createTestWorkspace();
  await ws.git.init();
  await commit(ws, "Initial commit", { "README.md": "# Library\n" });
  await ws.git.createAndSwitchBranch("feature");
  const search = await commit(ws, "Add search", { "search.js": "export const serach = 1;\n" });
  const typo = await commit(ws, "Fix typo", { "search.js": "export const search = 1;\n" });
  const debug = await commit(ws, "Add debug logging", { "debug.js": "console.log('x');\n" });
  const wip = await commit(ws, "wip", { "highlight.js": "export const highlight = 1;\n" });
  return { ws, search, typo, debug, wip };
}

const subjects = async (ws: TestWorkspace) =>
  (await ws.git.snapshot()).commits.map((commit) => commit.message.split("\n")[0]);
const editor = async (ws: TestWorkspace) => (await ws.git.snapshot()).editor;

/** Rewrites the todo list's command lines with `edit` (action per line, in order). */
function plan(todo: string, edit: (lines: string[]) => string[]): string {
  const lines = todo.split("\n");
  const commands = lines.filter((line) => line !== "" && !line.startsWith("#"));
  const comments = lines.filter((line) => line === "" || line.startsWith("#"));
  return [...edit(commands), ...comments].join("\n");
}

const retag = (line: string, action: string) => line.replace(/^pick/, action);

describe("git rebase -i", () => {
  it("opens the todo list in the editor and changes nothing yet", async () => {
    const { ws, search, wip } = await repo();
    const result = await ws.git.rebase("main", { interactive: true });
    expect(result).toMatchObject({
      ok: true,
      output: "hint: Waiting for your editor to close the file...",
      data: { status: "editing" },
    });
    const open = await editor(ws);
    expect(open?.file).toBe("git-rebase-todo");
    expect(open?.purpose).toBe("todo");
    expect(open?.content.split("\n").slice(0, 4)).toEqual([
      `pick ${search.slice(0, 7)} Add search`,
      expect.stringMatching(/^pick [0-9a-f]{7} Fix typo$/),
      expect.stringMatching(/^pick [0-9a-f]{7} Add debug logging$/),
      `pick ${wip.slice(0, 7)} wip`,
    ]);
    expect(open?.content).toContain(
      "# s, squash <commit> = use commit, but meld into previous commit",
    );
    expect((await ws.git.snapshot()).head).toBe(wip);
  });

  it("refuses other changes while the editor is open, but still reports status", async () => {
    const { ws } = await repo();
    await ws.git.rebase("main", { interactive: true });
    const blocked = await ws.git.commit({ message: "x" });
    expect(blocked.error?.code).toBe("EDITOR_OPEN");
    expect(blocked.output).toContain(
      "Git is waiting for you to close the editor (git-rebase-todo)",
    );
    expect((await ws.git.switchBranch("main")).error?.code).toBe("EDITOR_OPEN");
    expect((await ws.git.status()).ok).toBe(true);
    expect((await ws.git.rebaseControl("continue")).error?.code).toBe("EDITOR_OPEN");
  });

  it("keeps history as it was when the plan is saved unchanged", async () => {
    const { ws, wip } = await repo();
    await ws.git.rebase("main", { interactive: true });
    const result = await ws.git.closeEditor((await editor(ws))?.content ?? "");
    expect(result.output).toBe("Successfully rebased and updated refs/heads/feature.");
    expect((await ws.git.snapshot()).head).toBe(wip);
  });

  it("fixes up, drops and rewords, asking for the new message", async () => {
    const { ws } = await repo();
    await ws.git.rebase("main", { interactive: true });
    const todo = (await editor(ws))?.content ?? "";
    const edited = plan(todo, ([search = "", typo = "", , wip = ""]) => [
      search,
      retag(typo, "fixup"),
      // The debug commit's line is deleted: that drops it.
      retag(wip, "reword"),
    ]);
    const stopped = await ws.git.closeEditor(edited);
    expect(stopped.data?.status).toBe("editing");
    const message = await editor(ws);
    expect(message).toMatchObject({ file: "COMMIT_EDITMSG", purpose: "message" });
    expect(message?.content.startsWith("wip\n\n# Please enter the commit message")).toBe(true);

    const done = await ws.git.closeEditor("Highlight search matches\n# a comment\n");
    expect(done.output).toBe("Successfully rebased and updated refs/heads/feature.");
    expect(await subjects(ws)).toEqual([
      "Highlight search matches",
      "Add search",
      "Initial commit",
    ]);
    const snapshot = await ws.git.snapshot();
    expect(snapshot.editor).toBeNull();
    expect(snapshot.currentBranch).toBe("feature");
    expect(snapshot.commits[1]?.changedPaths).toEqual(["search.js"]);
    expect(await ws.files.readFile(ws.workspaceId, "search.js")).toBe("export const search = 1;\n");
    expect(await ws.files.exists(ws.workspaceId, "debug.js")).toBe(false);
    expect(snapshot.reflog[0]?.message).toBe("rebase (finish): returning to refs/heads/feature");
  });

  it("squashes with a combined message, and accepts short action names and reordering", async () => {
    const { ws } = await repo();
    await ws.git.rebase("main", { interactive: true });
    const todo = (await editor(ws))?.content ?? "";
    const edited = plan(todo, ([search = "", typo = "", debug = "", wip = ""]) => [
      search,
      retag(wip, "s"),
      retag(typo, "f"),
      retag(debug, "d"),
    ]);
    await ws.git.closeEditor(edited);
    const message = (await editor(ws))?.content ?? "";
    expect(message).toContain("# This is a combination of 3 commits.");
    expect(message).toContain("# This is the 1st commit message:\n\nAdd search");
    expect(message).toContain("# This is the commit message #2:\n\nwip");
    expect(message).toContain("# The commit message #3 will be skipped:\n\n# Fix typo");
    await ws.git.closeEditor(message);
    expect(await subjects(ws)).toEqual(["Add search", "Initial commit"]);
    expect((await ws.git.snapshot()).commits[0]?.message).toBe("Add search\n\nwip");
  });

  it("keeps the editor open with the learner's text when the plan is invalid", async () => {
    const { ws, wip } = await repo();
    await ws.git.rebase("main", { interactive: true });
    const todo = (await editor(ws))?.content ?? "";

    const squashFirst = plan(todo, ([search = "", ...rest]) => [retag(search, "squash"), ...rest]);
    const refused = await ws.git.closeEditor(squashFirst);
    expect(refused.ok).toBe(false);
    expect(refused.error?.code).toBe("INVALID_TODO");
    expect(refused.output).toContain("error: cannot 'squash' without a previous commit");
    expect(await editor(ws)).toMatchObject({ content: squashFirst });
    expect((await editor(ws))?.error).toContain("cannot 'squash'");

    const unknown = await ws.git.closeEditor(plan(todo, (lines) => ["frobnicate abc", ...lines]));
    expect(unknown.output).toContain("error: invalid line 1: frobnicate abc");
    const unsupported = await ws.git.closeEditor(
      plan(todo, ([a = "", ...rest]) => [retag(a, "edit"), ...rest]),
    );
    expect(unsupported.output).toContain("GitDojo does not support 'edit'");
    const badCommit = await ws.git.closeEditor("pick zzzzzzz Nope\n");
    expect(badCommit.output).toContain("could not parse 'zzzzzzz'");
    // Nothing happened: HEAD never moved.
    expect((await ws.git.snapshot()).head).toBe(wip);
  });

  it("does nothing when every line is removed", async () => {
    const { ws, wip } = await repo();
    await ws.git.rebase("main", { interactive: true });
    expect(await ws.git.closeEditor("# nothing\n")).toMatchObject({
      ok: true,
      output: "Nothing to do",
    });
    const snapshot = await ws.git.snapshot();
    expect(snapshot).toMatchObject({ head: wip, currentBranch: "feature", editor: null });
  });

  it("refuses an empty message and keeps waiting", async () => {
    const { ws } = await repo();
    await ws.git.rebase("HEAD~1", { interactive: true });
    const todo = (await editor(ws))?.content ?? "";
    await ws.git.closeEditor(plan(todo, ([wip = ""]) => [retag(wip, "reword")]));
    const refused = await ws.git.closeEditor("# only comments\n");
    expect(refused.output).toContain("Aborting commit due to empty commit message.");
    expect((await editor(ws))?.purpose).toBe("message");
  });

  it("aborts from the todo list or from a message, restoring everything", async () => {
    const fromTodo = await repo();
    await fromTodo.ws.git.rebase("main", { interactive: true });
    expect((await fromTodo.ws.git.rebaseControl("abort")).ok).toBe(true);
    expect(await editor(fromTodo.ws)).toBeNull();
    expect((await fromTodo.ws.git.snapshot()).head).toBe(fromTodo.wip);

    const fromMessage = await repo();
    await fromMessage.ws.git.rebase("main", { interactive: true });
    const todo = (await editor(fromMessage.ws))?.content ?? "";
    await fromMessage.ws.git.closeEditor(
      plan(todo, ([search = "", typo = "", debug = "", wip = ""]) => [
        retag(search, "reword"),
        typo,
        debug,
        wip,
      ]),
    );
    expect((await editor(fromMessage.ws))?.purpose).toBe("message");
    await fromMessage.ws.git.rebaseControl("abort");
    const snapshot = await fromMessage.ws.git.snapshot();
    expect(snapshot).toMatchObject({
      head: fromMessage.wip,
      currentBranch: "feature",
      editor: null,
    });
    expect(await fromMessage.ws.files.exists(fromMessage.ws.workspaceId, "debug.js")).toBe(true);
  });

  it("stops for conflicts and carries the plan on after --continue", async () => {
    const ws = await createTestWorkspace();
    await ws.git.init();
    await commit(ws, "Initial commit", { "app.txt": "one\n" });
    await commit(ws, "Say two", { "app.txt": "two\n" });
    await commit(ws, "Say three", { "app.txt": "three\n" });
    await commit(ws, "Add notes", { "notes.md": "# Notes\n" });
    await ws.git.rebase("HEAD~3", { interactive: true });
    const todo = (await editor(ws))?.content ?? "";
    // Dropping "Say two" makes "Say three" conflict: it changed a line "Say two" wrote.
    const result = await ws.git.closeEditor(
      plan(todo, ([, three = "", notes = ""]) => [three, retag(notes, "reword")]),
    );
    expect(result.error?.code).toBe("MERGE_CONFLICT");
    expect((await ws.git.status()).output).toMatch(
      /^interactive rebase in progress; onto [0-9a-f]{7}/,
    );
    await ws.files.writeFile(ws.workspaceId, "app.txt", "three\n");
    await ws.git.add(["app.txt"]);
    const continued = await ws.git.rebaseControl("continue");
    expect(continued.data?.status).toBe("editing");
    await ws.git.closeEditor("Add release notes\n");
    expect(await subjects(ws)).toEqual(["Add release notes", "Say three", "Initial commit"]);
  });

  it("needs a branch with commits and a clean working tree", async () => {
    const { ws } = await repo();
    await ws.files.writeFile(ws.workspaceId, "search.js", "changed\n");
    expect((await ws.git.rebase("main", { interactive: true })).error?.code).toBe("LOCAL_CHANGES");
    const empty = await createTestWorkspace();
    await empty.git.init();
    expect((await empty.git.rebase("main", { interactive: true })).error?.code).toBe(
      "NOT_ON_BRANCH",
    );
    expect((await empty.git.closeEditor("pick x")).error?.code).toBe("NO_OPERATION");
  });
});
