export const CAPSTONE_KEY = "git-skills-capstone";
export const CAPSTONE_RUBRIC_VERSION = 1;

export type GitObjectType = "blob" | "tree" | "commit";

/** Canonical, decompressed Git object bytes. The server verifies every oid before grading. */
export interface AssessmentGitObject {
  oid: string;
  type: GitObjectType;
  content: string;
}

export interface AssessmentEvidence {
  format: "gitdojo-assessment-evidence";
  version: 1;
  attemptId: string;
  head: string;
  /** Reflog tips preserve a reset-away mistake so recovery can be graded. */
  reflog: string[];
  objects: AssessmentGitObject[];
}

export interface AssessmentCriterionResult {
  id: "attempt" | "commits" | "branching" | "conflict" | "recovery";
  passed: boolean;
  feedback: string;
}

export interface AssessmentGrade {
  passed: boolean;
  rubricVersion: number;
  criteria: AssessmentCriterionResult[];
}
