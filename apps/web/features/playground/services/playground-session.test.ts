// @vitest-environment node
import "fake-indexeddb/auto";

import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type PlaygroundScenario } from "@gitdojo/shared-types";
import { describe, expect, it } from "vitest";
import { NEW_REPOSITORY_SETUP, PlaygroundSession } from "./playground-session";

let counter = 0;
/** One IndexedDB database; each call to the returned factory is a fresh page load on it. */
function database(): () => LessonEnvironment {
  counter += 1;
  const name = `playground-test-${String(counter)}`;
  let first = true;
  return () => {
    const fs = createLightningFs(name, { wipe: first });
    first = false;
    const gitFor = (workspaceId: string) => createGitEngine({ fs, workspaceId });
    return {
      files: new WorkspaceFileSystem(fs),
      gitFor,
      stateReader: createRepositoryStateReader(gitFor),
    };
  };
}

const twoCommits: PlaygroundScenario = {
  id: "two-commits",
  title: "Two commits",
  description: "d",
  setup: {
    initializeGit: true,
    commits: [
      { message: "A", files: { "a.txt": "a\n" } },
      { message: "B", files: { "b.txt": "b\n" } },
    ],
  },
};

describe("PlaygroundSession", () => {
  it("builds the initial scenario on the first visit and restores it after a reload", async () => {
    const open = database();
    const first = new PlaygroundSession(open());
    const started = await first.start(twoCommits.setup, twoCommits.id);
    expect(started.restored).toBe(false);
    expect(started.repository.commits).toHaveLength(2);

    await first.execute("git switch -c experiment");
    await first.writeFile("notes.md", "keep me\n");
    await first.execute("git add notes.md");
    await first.execute('git commit -m "Notes"');

    // A new page load: same database, new session. Nothing is rebuilt.
    const second = new PlaygroundSession(open());
    const restored = await second.start(twoCommits.setup, twoCommits.id);
    expect(restored.restored).toBe(true);
    expect(restored.repository.currentBranch).toBe("experiment");
    expect(restored.repository.commits.map((commit) => commit.message)).toEqual([
      "Notes",
      "B",
      "A",
    ]);
  });

  it("starts only once even when asked twice", async () => {
    const session = new PlaygroundSession(database()());
    const [a, b] = await Promise.all([
      session.start(twoCommits.setup, twoCommits.id),
      session.start(twoCommits.setup, twoCommits.id),
    ]);
    expect(a.restored).toBe(false);
    expect(b.restored).toBe(false);
  });

  it("replaces the repository with a scenario or a blank folder", async () => {
    const session = new PlaygroundSession(database()());
    await session.start(NEW_REPOSITORY_SETUP, "new");
    const loaded = await session.loadScenario(twoCommits);
    expect(loaded.repository.commits).toHaveLength(2);

    const blank = await session.load(NEW_REPOSITORY_SETUP, "new");
    expect(blank.repository.initialized).toBe(false);
    expect(blank.repository.files).toEqual([{ path: "README.md", status: "untracked" }]);
  });

  it("exports files and repository state as JSON", async () => {
    const session = new PlaygroundSession(database()());
    await session.start(twoCommits.setup, twoCommits.id);
    await session.writeFile("a.txt", "changed\n");
    const snapshot = await session.exportSnapshot("two-commits");
    expect(snapshot).toMatchObject({
      format: "gitdojo-playground-snapshot",
      version: 1,
      scenario: "two-commits",
      files: { "a.txt": "changed\n", "b.txt": "b\n" },
    });
    expect(snapshot.repository.files).toContainEqual({ path: "a.txt", status: "modified" });
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
