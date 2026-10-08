import { applySetup, type LessonEnvironment } from "@gitdojo/lesson-engine";
import {
  type LessonSetup,
  type PlaygroundScenario,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { WorkspaceSession } from "@/features/workspace";

export const PLAYGROUND_WORKSPACE = "playground";

export interface PlaygroundSnapshot {
  repository: RepositoryState;
}

/** A blank folder with a README: no repository until the learner runs `git init`. */
export const NEW_REPOSITORY_SETUP: LessonSetup = {
  files: { "README.md": "# My project\n\nStart with `git init`.\n" },
};

/** Everything needed to look at a playground repository again, as plain JSON. */
export interface PlaygroundExport {
  format: "gitdojo-playground-snapshot";
  version: 1;
  exportedAt: string;
  scenario: string | null;
  /** Working-tree files (not `.git`), path → content. */
  files: Record<string, string>;
  repository: RepositoryState;
}

/**
 * The playground's workspace. Unlike a lesson it validates nothing, and it is not rebuilt on
 * load: the repository lives in IndexedDB, so a refresh continues exactly where the learner was.
 */
export class PlaygroundSession extends WorkspaceSession<PlaygroundSnapshot> {
  private started: Promise<boolean> | null = null;

  constructor(env: LessonEnvironment, workspaceId = PLAYGROUND_WORKSPACE) {
    super(workspaceId, env);
  }

  /**
   * Opens the saved repository, or builds `initial` when there is none (first visit, or storage
   * was cleared). Runs once per session (React effects can re-run); later calls resolve to the
   * latest state, still reporting whether the first call restored a saved repository.
   */
  async start(
    initial: LessonSetup,
    origin: string,
  ): Promise<PlaygroundSnapshot & { restored: boolean }> {
    this.started ??= this.enqueue(async () => {
      await this.env.files.createWorkspace(this.workspaceId);
      const saved =
        (await this.env.files.exists(this.workspaceId, ".git")) ||
        (await this.env.files.listFiles(this.workspaceId)).length > 0;
      if (!saved) {
        await applySetup(initial, this.workspaceId, this.env, origin);
        await this.persist();
      }
      return saved;
    });
    const restored = await this.started;
    return { ...(await this.enqueue(async () => this.evaluate(await this.readState()))), restored };
  }

  /** Replaces the workspace with a scenario's starting state. */
  load(setup: LessonSetup, origin: string): Promise<PlaygroundSnapshot> {
    return this.enqueue(async () => {
      const repository = await applySetup(setup, this.workspaceId, this.env, origin);
      await this.persist();
      return this.evaluate(repository);
    });
  }

  loadScenario(scenario: PlaygroundScenario): Promise<PlaygroundSnapshot> {
    return this.load(scenario.setup, scenario.id);
  }

  exportSnapshot(scenario: string | null): Promise<PlaygroundExport> {
    return this.enqueue(async () => {
      const files: Record<string, string> = {};
      for (const entry of await this.env.files.listFiles(this.workspaceId)) {
        if (entry.type === "file") {
          files[entry.path] = await this.env.files.readFile(this.workspaceId, entry.path);
        }
      }
      return {
        format: "gitdojo-playground-snapshot",
        version: 1,
        exportedAt: new Date().toISOString(),
        scenario,
        files,
        repository: await this.readState(),
      };
    });
  }

  /** The playground is kept between visits, so every change is written to IndexedDB at once. */
  protected override persist(): Promise<void> {
    return this.env.files.flush();
  }

  protected evaluate(repository: RepositoryState): Promise<PlaygroundSnapshot> {
    return Promise.resolve({ repository });
  }
}
