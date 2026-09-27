export type ValidatorDefinition =
  | { type: "repository_initialized" }
  | { type: "file_exists"; file: string }
  | { type: "file_staged"; file: string }
  | { type: "commit_exists"; message?: string }
  | { type: "commit_count"; count: number }
  | { type: "clean_worktree" };

export type ValidatorType = ValidatorDefinition["type"];

export interface ValidatorResult {
  passed: boolean;
  reason?: string;
}
