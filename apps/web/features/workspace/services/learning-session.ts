import { runCommandLine, type CommandExecutionResult } from "@gitdojo/command-parser";
import {
  advanceProgress,
  createInitialProgress,
  resetLesson,
  setupLesson,
  type LessonEnvironment,
  type LessonProgress,
} from "@gitdojo/lesson-engine";
import {
  type LessonDefinition,
  type LessonValidationResult,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { validateLesson } from "@gitdojo/validator";

export interface SessionSnapshot {
  repository: RepositoryState;
  validation: LessonValidationResult;
  progress: LessonProgress;
}

export interface CommandOutcome {
  result: CommandExecutionResult;
  snapshot: SessionSnapshot;
}

export function workspaceIdForLesson(lesson: LessonDefinition): string {
  return `lesson-${lesson.id}`;
}

/**
 * One learner's attempt at one lesson. Implements the core loop:
 * command → Git engine → repository state → validation → progress.
 * Operations are queued so a reset can never interleave with a running command.
 */
export class LearningSession {
  readonly workspaceId: string;
  readonly lessonId: string;
  private progress: LessonProgress;
  private queue: Promise<unknown> = Promise.resolve();
  private started: Promise<unknown> | null = null;
  private latest: SessionSnapshot | null = null;

  constructor(
    private readonly lesson: LessonDefinition,
    private readonly env: LessonEnvironment,
  ) {
    this.workspaceId = workspaceIdForLesson(lesson);
    this.lessonId = lesson.id;
    this.progress = createInitialProgress(lesson);
  }

  /**
   * Sets up the lesson workspace once, then resolves to the *latest* snapshot. Calling it again
   * (React effects can re-run) never re-runs setup and never returns stale state.
   */
  async start(): Promise<SessionSnapshot> {
    this.started ??= this.enqueue(async () =>
      this.evaluate(await setupLesson(this.lesson, this.workspaceId, this.env)),
    );
    await this.started;
    // Wait for any queued commands so the snapshot reflects them.
    return this.enqueue(() => Promise.resolve(this.requireLatest()));
  }

  execute(input: string): Promise<CommandOutcome> {
    return this.enqueue(async () => {
      const result = await runCommandLine(input, {
        workspaceId: this.workspaceId,
        git: this.env.gitFor(this.workspaceId),
      });
      // Recompute from scratch after every command; the UI never patches state incrementally.
      const repository = await this.env.stateReader.read(this.workspaceId);
      return { result, snapshot: await this.evaluate(repository) };
    });
  }

  reset(): Promise<SessionSnapshot> {
    return this.enqueue(async () => {
      this.progress = createInitialProgress(this.lesson);
      return this.evaluate(await resetLesson(this.lesson, this.workspaceId, this.env));
    });
  }

  private async evaluate(repository: RepositoryState): Promise<SessionSnapshot> {
    const validation = await validateLesson(this.lesson, { repository });
    this.progress = advanceProgress(this.lesson, this.progress, validation);
    this.latest = { repository, validation, progress: this.progress };
    return this.latest;
  }

  private requireLatest(): SessionSnapshot {
    if (!this.latest) throw new Error("Learning session has not been set up");
    return this.latest;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    // Keep the queue alive after failures; callers still receive the rejection.
    this.queue = run.catch(() => undefined);
    return run;
  }
}
