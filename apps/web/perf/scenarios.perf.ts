/**
 * Stress scenarios for GitDojo's hot paths, run with `pnpm perf`. Each scenario checks that the
 * result is still correct and prints how long it took; there are deliberately no time limits,
 * since timings vary by machine. Results are recorded in docs/testing.md.
 */
import { runCommandLine } from "@gitdojo/command-parser";
import { createGitEngine, createLightningFs, WorkspaceFileSystem } from "@gitdojo/git-engine";
import { parseLesson, type LessonEnvironment } from "@gitdojo/lesson-engine";
import { createIndexedDbStorage, ProgressRepository, type ProgressAction } from "@gitdojo/progress";
import { createRepositoryStateReader } from "@gitdojo/repository-state";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { IDBFactory } from "fake-indexeddb";
import { afterAll, describe, expect, it } from "vitest";
import { EditorController } from "@/features/editor/services/editor-controller";
import { useEditorStore } from "@/features/editor/state/use-editor-store";
import { buildCommitGraph } from "@/features/repository/services/build-commit-graph";
import { assignLanes, type LaneCommit } from "@/features/repository/services/lanes";
import { LearningSession } from "@/features/workspace/services/learning-session";

const results: { scenario: string; size: string; ms: number; note?: string }[] = [];

async function measure<T>(
  scenario: string,
  size: string,
  task: () => Promise<T> | T,
  note?: string,
): Promise<T> {
  const start = performance.now();
  const value = await task();
  results.push({
    scenario,
    size,
    ms: Math.round((performance.now() - start) * 10) / 10,
    ...(note ? { note } : {}),
  });
  return value;
}

afterAll(() => {
  // A Markdown table, ready for docs/testing.md. stderr, because Vitest hides passing tests' logs.
  const rows = results.map(
    (row) =>
      `| ${row.scenario} | ${row.size} | ${String(row.ms)} |${row.note ? ` ${row.note} |` : ""}`,
  );
  process.stderr.write(
    ["", "| Scenario | Size | ms |", "| --- | --- | ---: |", ...rows, ""].join("\n"),
  );
});

let counter = 0;
function environment(): LessonEnvironment & { fs: ReturnType<typeof createLightningFs> } {
  counter += 1;
  const fs = createLightningFs(`perf-${String(counter)}`, { wipe: true });
  const gitFor = (workspaceId: string) => createGitEngine({ fs, workspaceId });
  return {
    fs,
    files: new WorkspaceFileSystem(fs),
    gitFor,
    stateReader: createRepositoryStateReader(gitFor),
  };
}

const run = (env: LessonEnvironment, workspace: string, line: string) =>
  runCommandLine(line, { workspaceId: workspace, git: env.gitFor(workspace) });

describe("repository scale", () => {
  it("handles a long commit history", async () => {
    const COMMITS = 300;
    const env = environment();
    await env.files.createWorkspace("history");
    await run(env, "history", "git init");
    await measure("create commits (git add + commit)", `${String(COMMITS)} commits`, async () => {
      for (let i = 0; i < COMMITS; i += 1) {
        await env.files.writeFile("history", "log.txt", `entry ${String(i)}\n`);
        await run(env, "history", "git add log.txt");
        await run(env, "history", `git commit -m "Commit ${String(i)}"`);
      }
    });
    // Branches every 50 commits, so the graph has several lanes.
    for (let i = 0; i < 5; i += 1) {
      await run(env, "history", `git branch topic-${String(i)} HEAD~${String(i * 50)}`);
    }

    const state = await measure("read repository state", `${String(COMMITS)} commits`, () =>
      env.stateReader.read("history"),
    );
    expect(state.commits).toHaveLength(COMMITS);
    const log = await measure("git log --oneline", `${String(COMMITS)} commits`, () =>
      run(env, "history", "git log --oneline"),
    );
    expect(log.output.split("\n")).toHaveLength(COMMITS);
    await measure("git log --all --oneline", `${String(COMMITS)} commits, 6 branches`, () =>
      run(env, "history", "git log --all --oneline"),
    );
    const graph = await measure(
      "build commit graph (React Flow nodes)",
      `${String(COMMITS)} commits`,
      () => buildCommitGraph(state, null),
    );
    expect(graph.nodes).toHaveLength(COMMITS);
    await measure("git reflog", `${String(COMMITS * 2 + 5)} entries`, () =>
      run(env, "history", "git reflog"),
    );
  }, 300_000);

  it("handles many files", async () => {
    const FILES = 500;
    const env = environment();
    await env.files.createWorkspace("files");
    await run(env, "files", "git init");
    for (let i = 0; i < FILES; i += 1) {
      await env.files.writeFile(
        "files",
        `src/dir-${String(i % 20)}/file-${String(i)}.ts`,
        `export const n = ${String(i)};\n`,
      );
    }
    await measure("git status (all untracked)", `${String(FILES)} files`, () =>
      run(env, "files", "git status"),
    );
    await measure("git add .", `${String(FILES)} files`, () => run(env, "files", "git add ."));
    await measure("git commit", `${String(FILES)} files`, () =>
      run(env, "files", 'git commit -m "Add files"'),
    );
    for (let i = 0; i < 50; i += 1) {
      await env.files.writeFile(
        "files",
        `src/dir-${String(i % 20)}/file-${String(i)}.ts`,
        "changed\n",
      );
    }
    await measure("git status (50 modified)", `${String(FILES)} files`, () =>
      run(env, "files", "git status"),
    );
    const state = await measure(
      "read repository state",
      `${String(FILES)} files, 50 modified`,
      () => env.stateReader.read("files"),
    );
    expect(state.files.filter((file) => file.status === "modified")).toHaveLength(50);
    await measure("git diff", "50 modified files", () => run(env, "files", "git diff"));
  }, 300_000);
});

describe("commit graph layout", () => {
  it("assigns lanes for a large branching history", async () => {
    const COMMITS = 5000;
    // Ten branches forking from a trunk, newest first, with merges back every so often.
    const commits: LaneCommit[] = [];
    for (let i = COMMITS - 1; i >= 0; i -= 1) {
      const parents = i === 0 ? [] : [`c${String(i - 1)}`];
      if (i % 25 === 0 && i > 50) parents.push(`c${String(i - 37)}`);
      commits.push({ id: `c${String(i)}`, parents });
    }
    const layout = await measure("assign lanes", `${String(COMMITS)} commits`, () =>
      assignLanes(commits, ["c4999"]),
    );
    expect(layout.lanes.size).toBe(COMMITS);
  });
});

describe("content", () => {
  it("parses a very large lesson", async () => {
    const blocks = Array.from(
      { length: 400 },
      (_, i) =>
        `  - type: example\n    command: git commit -m "Step ${String(i)}"\n    output: "[main abc1234] Step ${String(i)}"\n    explanation: Explanation number ${String(i)} with some **markdown** and \`code\`.\n`,
    ).join("");
    const objectives = Array.from(
      { length: 60 },
      (_, i) =>
        `  - id: o${String(i)}\n    description: Objective ${String(i)}\n    validator:\n      type: file_exists\n      file: f${String(i)}.txt\n`,
    ).join("");
    const yaml = `id: big\nslug: big\ntitle: Big lesson\ndifficulty: beginner\nconcepts: [scale]\ncontent:\n${blocks}objectives:\n${objectives}`;
    const lesson = await measure(
      "parse + validate lesson YAML",
      `${String(Math.round(yaml.length / 1024))} KB, 400 blocks, 60 objectives`,
      () => parseLesson(yaml, "big.yaml"),
    );
    expect(lesson.objectives).toHaveLength(60);
  });
});

const LESSON: LessonDefinition = {
  id: "rapid",
  slug: "rapid",
  title: "Rapid",
  difficulty: "beginner",
  concepts: [],
  setup: { files: { "README.md": "# Hi\n" } },
  objectives: [{ id: "commit", description: "Commit", validator: { type: "commit_exists" } }],
};

describe("rapid input", () => {
  it("keeps rapidly submitted commands in order", async () => {
    const ROUNDS = 60;
    const env = environment();
    const session = new LearningSession(LESSON, env);
    await session.start();
    await session.execute("git init");
    // Nothing is awaited: files, adds and commits are all queued at once, as if typed very fast.
    const pending: Promise<unknown>[] = [];
    await measure(
      "queue edit + add + commit rounds",
      `${String(ROUNDS)} rounds (180 operations)`,
      async () => {
        for (let i = 0; i < ROUNDS; i += 1) {
          pending.push(session.writeFile(`file-${String(i)}.txt`, `${String(i)}\n`));
          pending.push(session.execute(`git add file-${String(i)}.txt`));
          pending.push(session.execute(`git commit -m "Round ${String(i)}"`));
        }
        await Promise.all(pending);
      },
    );
    const { result } = await session.execute("git log --oneline");
    const subjects = result.output.split("\n").map((line) => line.slice(8));
    expect(subjects).toEqual(
      Array.from({ length: ROUNDS }, (_, i) => `Round ${String(ROUNDS - 1 - i)}`).map(
        (subject, index) => (index === 0 ? `(HEAD -> main) ${subject}` : subject),
      ),
    );
  }, 300_000);

  it("never loses the latest editor edit under rapid typing", async () => {
    const EDITS = 500;
    const env = environment();
    const session = new LearningSession(LESSON, env);
    await session.start();
    useEditorStore.getState().reset();
    const controller = new EditorController(
      {
        readFile: (path) => session.readFile(path),
        saveFile: async (path, content) => {
          await session.writeFile(path, content);
        },
        createFile: async (path) => {
          await session.createFile(path);
        },
        deleteFile: async (path) => {
          await session.deleteFile(path);
        },
      },
      useEditorStore,
      // A short pause so saves really do overlap with further typing.
      2,
    );
    useEditorStore.getState().openFile("README.md");
    await controller.loadPending();

    let text = "# Hi\n";
    await measure("type with autosave, then flush", `${String(EDITS)} keystrokes`, async () => {
      for (let i = 0; i < EDITS; i += 1) {
        text += String(i % 10);
        controller.change("README.md", text);
        // Let some saves start mid-typing.
        if (i % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 3));
      }
      await controller.flush();
    });
    expect(await session.readFile("README.md")).toBe(text);
  }, 120_000);
});

describe("progress", () => {
  it("absorbs frequent progress updates", async () => {
    const factory = new IDBFactory();
    const repository = new ProgressRepository({
      storage: createIndexedDbStorage(factory),
      catalog: { courses: [], lessons: [], challenges: [] },
    });
    await repository.load();
    const command: ProgressAction = { type: "command", command: "status", ok: true };

    await measure("sequential updates (each awaited)", "200 updates", async () => {
      for (let i = 0; i < 200; i += 1) await repository.apply(command);
    });
    const burst = await measure("burst of updates (batched)", "1000 updates", () =>
      Promise.all(Array.from({ length: 1000 }, () => repository.apply(command))),
    );
    expect(burst.at(-1)?.commandStats.status?.uses).toBe(1200);
  });
});
