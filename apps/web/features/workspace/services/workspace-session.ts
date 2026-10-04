import { runCommandLine, type CommandExecutionResult } from "@gitdojo/command-parser";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { type RepositoryState } from "@gitdojo/shared-types";

export interface CommandOutcome<S> {
  result: CommandExecutionResult;
  snapshot: S;
}

/** Thrown when the learner tries to create a file that is already there. */
export class FileExistsError extends Error {
  constructor(readonly path: string) {
    super(`${path} already exists`);
    this.name = "FileExistsError";
  }
}

/**
 * One workspace (a lesson attempt, a challenge or the playground) and the loop around it:
 * command or file edit → Git engine / virtual filesystem → repository state → `evaluate`.
 *
 * Operations are queued so a reset can never interleave with a running command, and an editor
 * save always lands before the command typed after it.
 */
export abstract class WorkspaceSession<S> {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly workspaceId: string,
    protected readonly env: LessonEnvironment,
  ) {}

  /** Turns fresh repository state into whatever this kind of session publishes. */
  protected abstract evaluate(repository: RepositoryState): Promise<S>;

  /**
   * Called after anything that may have changed the workspace. Lessons are rebuilt on every
   * visit, so by default nothing needs saving; the playground overrides this to persist.
   */
  protected persist(): Promise<void> {
    return Promise.resolve();
  }

  execute(input: string): Promise<CommandOutcome<S>> {
    return this.enqueue(async () => {
      const result = await runCommandLine(input, {
        workspaceId: this.workspaceId,
        git: this.env.gitFor(this.workspaceId),
      });
      await this.persist();
      // Recompute from scratch after every command; the UI never patches state incrementally.
      return { result, snapshot: await this.evaluate(await this.readState()) };
    });
  }

  /** Reads a working-tree file, e.g. to open it in the editor. */
  readFile(path: string): Promise<string> {
    return this.enqueue(() => this.env.files.readFile(this.workspaceId, path));
  }

  /**
   * Saves a working-tree file edited in the UI. Like a command, it is followed by a fresh read of
   * the repository and a new evaluation (editing a file is not a Git command, so no output).
   */
  writeFile(path: string, content: string): Promise<S> {
    return this.enqueue(async () => {
      await this.env.files.writeFile(this.workspaceId, path, content);
      await this.persist();
      return this.evaluate(await this.readState());
    });
  }

  /** Creates an empty file; refuses to overwrite one that exists. */
  createFile(path: string): Promise<S> {
    return this.enqueue(async () => {
      if (await this.env.files.exists(this.workspaceId, path)) throw new FileExistsError(path);
      await this.env.files.writeFile(this.workspaceId, path, "");
      await this.persist();
      return this.evaluate(await this.readState());
    });
  }

  /** Deletes a working-tree file, the way `rm` would. Git then reports it as deleted. */
  deleteFile(path: string): Promise<S> {
    return this.enqueue(async () => {
      await this.env.files.removeFile(this.workspaceId, path);
      await this.persist();
      return this.evaluate(await this.readState());
    });
  }

  protected readState(): Promise<RepositoryState> {
    return this.env.stateReader.read(this.workspaceId);
  }

  protected enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // Keep the queue alive after failures; callers still receive the rejection.
    this.queue = run.catch(() => undefined);
    return run;
  }
}
