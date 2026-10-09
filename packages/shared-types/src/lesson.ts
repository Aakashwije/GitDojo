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
  /**
   * Files written and staged for this commit (workspace-relative path → content). `null` deletes
   * a file the branch has, e.g. to set up a modify/delete conflict.
   */
  files: Record<string, string | null>;
  /**
   * Branch to commit on (default: `main`). A branch that does not exist yet is created at `main`'s
   * tip at that point in the list.
   */
  branch?: string;
}

export interface LessonSetup {
  /** Workspace-relative path → file content. Written after the history, as uncommitted changes. */
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
  /**
   * Git commands run last (after the commits, branches and files), exactly as if typed in the
   * terminal, e.g. `git reset --hard HEAD~1` to leave a commit only the reflog remembers,
   * `git switch --detach HEAD~1`, or `git add notes.md` to stage a setup file. Each must succeed.
   */
  commands?: string[];
}

/**
 * How much a hint gives away:
 * 1. a conceptual clue ("Your changes only exist in the working tree."),
 * 2. the command family ("You need the command that moves a file into staging."),
 * 3. the specific command ("`git add README.md`").
 */
export type HintLevel = 1 | 2 | 3;

/** A hint as authored: plain text (its level is inferred from its position) or with a level. */
export type LessonHintInput = string | { level: HintLevel; text: string };

/** A hint with its level settled. */
export interface Hint {
  level: HintLevel;
  text: string;
}

/** How far a learner has gone down one objective's hint ladder. */
export interface HintState {
  objectiveId: string;
  revealedHints: number;
  totalHints: number;
}

export interface LessonEditorSettings {
  /** Files can be opened and read but not changed (default false). */
  readOnly?: boolean;
}

export interface LessonObjective {
  id: string;
  description: string;
  validator: ValidatorDefinition;
}

/**
 * Feedback shown while an authored condition holds, e.g. "the fix is on `main`; this challenge
 * expects it on `fix/rounding`".
 *
 * Tips describe the state the learner is in, never the command that produced it: the app sees
 * repository state, not intent. They are re-evaluated from scratch after every action, so a tip
 * appears the moment its conditions hold and disappears as soon as they stop.
 */
export interface LessonTip {
  id: string;
  /** Every condition must pass for the tip to show. */
  when: ValidatorDefinition[];
  text: string;
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
  /** Objective id → hints ordered from vague to explicit (see {@link HintLevel}). */
  hints?: Record<string, LessonHintInput[]>;
  /** Feedback for states that lead away from the goal; the first matching one is shown. */
  tips?: LessonTip[];
  /** Code editor settings for hands-on lessons. */
  editor?: LessonEditorSettings;
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

// ---------------------------------------------------------------------------------------------
// Playground
// ---------------------------------------------------------------------------------------------

/** A ready-made repository to experiment with, as authored in `content/playground/<id>.yaml`. */
export interface PlaygroundScenario {
  id: string;
  title: string;
  description: string;
  /** Position in the scenario picker; lower comes first. */
  order?: number;
  setup: LessonSetup;
}

// ---------------------------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------------------------

export type ChallengeCategory =
  "basics" | "branching" | "merging" | "conflicts" | "recovery" | "history" | "advanced";

/**
 * A real-world Git problem, as authored in `content/challenges/<id>.yaml`: a scenario, a mission
 * and success conditions, but no step-by-step instructions.
 */
export interface ChallengeDefinition {
  /** Also the URL slug and file name. */
  id: string;
  title: string;
  category: ChallengeCategory;
  difficulty: LessonDifficulty;
  /** Position within its category; lower comes first. */
  order?: number;
  /** What happened: the situation the learner walks into. */
  scenario: string;
  /** What to achieve, without saying how. */
  mission: string;
  concepts: string[];
  /** Git commands (e.g. `reset`, `stash`) the challenge needs. It stays locked until all exist. */
  requires?: string[];
  setup: LessonSetup;
  /** The success conditions, checked against repository state like lesson objectives. */
  objectives: LessonObjective[];
  /** Objective id → hints, vague first. Never the exact command (no level 3). */
  hints?: Record<string, LessonHintInput[]>;
  /** Feedback for states that lead away from the mission; the first matching one is shown. */
  tips?: LessonTip[];
}

/** What the challenge browser needs, without setup or objectives. */
export interface ChallengeSummary {
  id: string;
  title: string;
  category: ChallengeCategory;
  difficulty: LessonDifficulty;
  mission: string;
  concepts: string[];
  /** 1-based position across all challenges. */
  number: number;
  /** Commands from `requires` that GitDojo cannot run yet; empty when playable. */
  missingCommands: string[];
}
