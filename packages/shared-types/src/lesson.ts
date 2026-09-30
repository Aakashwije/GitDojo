import { type ValidatorDefinition, type ValidatorResult } from "./validator";

export type LessonDifficulty = "beginner" | "intermediate" | "advanced";

/**
 * - `concept`: reading and visual demonstrations only; no terminal and no objectives.
 * - `interactive`: a guided exercise with objectives and hints ending in the exact command.
 * - `challenge`: a scenario to solve without step-by-step guidance.
 */
export type LessonType = "concept" | "interactive" | "challenge";

/** A commit created while setting up a lesson, before the learner types anything. */
export interface LessonSetupCommit {
  message: string;
  /** Files written and staged for this commit (workspace-relative path → content). */
  files: Record<string, string>;
  /**
   * Branch to commit on (default: `main`). A branch that does not exist yet is created at `main`'s
   * tip at that point in the list.
   */
  branch?: string;
}

export interface LessonSetup {
  /** Workspace-relative path → file content. Written last, so they are uncommitted changes. */
  files?: Record<string, string>;
  /** Extra (possibly empty) directories to create. */
  directories?: string[];
  initializeGit?: boolean;
  /** Commits on the default branch, oldest first. Requires `initializeGit`. */
  commits?: LessonSetupCommit[];
  /** Branches created at `main`'s last setup commit. */
  branches?: string[];
  /** Branch the learner starts on (default: `main`). */
  currentBranch?: string;
}

export interface LessonObjective {
  id: string;
  description: string;
  validator: ValidatorDefinition;
}

// ---------------------------------------------------------------------------------------------
// Visual content for concept lessons (and optional extra material in interactive lessons)
// ---------------------------------------------------------------------------------------------

/** A file in a working tree / staging area / repository illustration. */
export type DemoFile =
  string | { path: string; status: "untracked" | "modified" | "staged" | "committed" | "deleted" };

/** Snapshot of Git's three areas, e.g. to show a file moving from one to the next. */
export interface DemoAreas {
  workingTree: DemoFile[];
  staging: DemoFile[];
  repository: DemoFile[];
}

export interface DemoGraphCommit {
  /** Short label used to reference this commit, e.g. `A` or `c1`. */
  id: string;
  message?: string;
  /** Parent commit id; omitted for the root commit. Parents must be listed before children. */
  parent?: string;
  /** Second parent, for a merge commit. */
  merge?: string;
}

/** A tiny hand-authored commit graph, used to explain branches and HEAD. */
export interface DemoGraph {
  commits: DemoGraphCommit[];
  /** Branch name → commit id. */
  branches?: Record<string, string>;
  /** A branch name (HEAD attached to it) or a commit id (detached HEAD). */
  head?: string;
}

/** One visual: exactly one of `ascii`, `graph` or `areas` is set. */
export interface LessonVisual {
  ascii?: string;
  graph?: DemoGraph;
  areas?: DemoAreas;
}

export interface DemoStep extends Omit<LessonVisual, "ascii"> {
  /** Optional command shown as if typed in the terminal. */
  command?: string;
  caption: string;
}

export type LessonContentBlock =
  | { type: "text"; title?: string; body: string }
  | ({ type: "diagram"; title?: string; caption?: string } & LessonVisual)
  | { type: "example"; title?: string; command: string; output?: string; explanation?: string }
  | { type: "comparison"; title?: string; columns: { title: string; items: string[] }[] }
  | { type: "callout"; tone: "tip" | "note" | "warning"; title?: string; body: string }
  | { type: "demo"; title?: string; steps: DemoStep[] };

export type LessonContentBlockType = LessonContentBlock["type"];

// ---------------------------------------------------------------------------------------------

export interface LessonDefinition {
  id: string;
  slug: string;
  title: string;
  /** Defaults to `interactive`. */
  type?: LessonType;
  description?: string;
  /** One-sentence goal shown at the top of the lesson panel. */
  goal?: string;
  difficulty: LessonDifficulty;
  concepts: string[];
  /** Commands the learner practices; listed on the completion card. */
  commands?: string[];
  /** Explanations, diagrams, examples and demos. Required for concept lessons. */
  content?: LessonContentBlock[];
  setup: LessonSetup;
  /** Empty for concept lessons; at least one for interactive lessons and challenges. */
  objectives: LessonObjective[];
  /** Objective id → hints ordered from vague to explicit. */
  hints?: Record<string, string[]>;
  completion?: {
    xp?: number;
  };
}

export function lessonTypeOf(lesson: Pick<LessonDefinition, "type">): LessonType {
  return lesson.type ?? "interactive";
}

export interface ObjectiveValidationResult extends ValidatorResult {
  objectiveId: string;
}

export interface LessonValidationResult {
  lessonId: string;
  objectives: ObjectiveValidationResult[];
  passedCount: number;
  totalCount: number;
  completed: boolean;
}

// ---------------------------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------------------------

/** A course as authored in `content/courses/<slug>.yaml`. */
export interface CourseDefinition {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: LessonDifficulty;
  /** Position on the course list; lower comes first. */
  order?: number;
  /** Lesson slugs in learning order; files live in `content/lessons/<course slug>/`. */
  lessons: string[];
}

/** The per-lesson information course navigation needs, without the lesson's full content. */
export interface CourseLessonSummary {
  id: string;
  slug: string;
  title: string;
  type: LessonType;
  /** 1-based position in the course. */
  number: number;
}

/** A course with its lessons resolved, ready to send to the client. */
export interface CourseOutline {
  id: string;
  slug: string;
  title: string;
  description: string;
  difficulty: LessonDifficulty;
  lessons: CourseLessonSummary[];
}
