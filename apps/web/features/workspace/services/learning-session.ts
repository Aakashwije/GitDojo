import {
  advanceProgress,
  createInitialProgress,
  resetLesson,
  setupLesson,
  type LessonEnvironment,
  type LessonProgress,
} from "@gitdojo/lesson-engine";
import {
  type AdaptiveHintRecommendation,
  type LessonDefinition,
  type LessonValidationResult,
  type RepositoryState,
} from "@gitdojo/shared-types";
import { evaluateAdaptiveHints, evaluateTips, validateLesson } from "@gitdojo/validator";
import {
  WorkspaceSession,
  type CommandOutcome as WorkspaceCommandOutcome,
} from "./workspace-session";

export interface SessionSnapshot {
  repository: RepositoryState;
  validation: LessonValidationResult;
  progress: LessonProgress;
  /** Ids of the lesson's tips whose conditions hold right now, in authored order. */
  tips: string[];
  /** The first adaptive hint rule for the current objective that matches right now. */
  adaptiveHint: AdaptiveHintRecommendation | null;
}

export type CommandOutcome = WorkspaceCommandOutcome<SessionSnapshot>;

export function workspaceIdForLesson(lesson: LessonDefinition): string {
  return `lesson-${lesson.id}`;
}

/**
 * One learner's attempt at one lesson. Implements the core loop:
 * command → Git engine → repository state → validation → progress.
 */
export class LearningSession extends WorkspaceSession<SessionSnapshot> {
  readonly lessonId: string;
  private progress: LessonProgress;
  private started: Promise<unknown> | null = null;
  private latest: SessionSnapshot | null = null;

  constructor(
    private readonly lesson: LessonDefinition,
    env: LessonEnvironment,
    /** Challenges use their own workspaces, so ids never clash with lessons. */
    workspaceId: string = workspaceIdForLesson(lesson),
  ) {
    super(workspaceId, env);
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

  reset(): Promise<SessionSnapshot> {
    return this.enqueue(async () => {
      this.progress = createInitialProgress(this.lesson);
      return this.evaluate(await resetLesson(this.lesson, this.workspaceId, this.env));
    });
  }

  protected async evaluate(repository: RepositoryState): Promise<SessionSnapshot> {
    const validation = await validateLesson(this.lesson, { repository });
    this.progress = advanceProgress(this.lesson, this.progress, validation);
    // Tips describe the state right now, so they are recomputed rather than accumulated: one
    // stops showing the moment the learner resolves what it describes.
    const tips = this.lesson.tips ? await evaluateTips(this.lesson.tips, { repository }) : [];
    const adaptiveHint = await this.matchAdaptiveHint(repository);
    this.latest = { repository, validation, progress: this.progress, tips, adaptiveHint };
    return this.latest;
  }

  /** Recomputed like tips, and only for the objective that is current after this step. */
  private async matchAdaptiveHint(
    repository: RepositoryState,
  ): Promise<AdaptiveHintRecommendation | null> {
    const rules = this.lesson.adaptiveHints;
    const objectiveId = this.progress.currentObjectiveId;
    if (!rules || objectiveId === null) return null;
    const ruleId = await evaluateAdaptiveHints(rules, objectiveId, { repository });
    return ruleId === null ? null : { lessonId: this.lesson.id, objectiveId, ruleId };
  }

  private requireLatest(): SessionSnapshot {
    if (!this.latest) throw new Error("Learning session has not been set up");
    return this.latest;
  }
}
