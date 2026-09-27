import { type ValidatorDefinition, type ValidatorResult } from "./validator";

export type LessonDifficulty = "beginner" | "intermediate" | "advanced";

export interface LessonSetup {
  /** Workspace-relative path → file content. */
  files?: Record<string, string>;
  /** Extra (possibly empty) directories to create. */
  directories?: string[];
  initializeGit?: boolean;
}

export interface LessonObjective {
  id: string;
  description: string;
  validator: ValidatorDefinition;
}

export interface LessonDefinition {
  id: string;
  slug: string;
  title: string;
  description?: string;
  /** One-sentence goal shown at the top of the lesson panel. */
  goal?: string;
  difficulty: LessonDifficulty;
  concepts: string[];
  /** Commands the learner practices; listed on the completion card. */
  commands?: string[];
  setup: LessonSetup;
  objectives: LessonObjective[];
  /** Objective id → hints ordered from vague to explicit. */
  hints?: Record<string, string[]>;
  completion?: {
    xp?: number;
  };
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
