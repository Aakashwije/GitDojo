import { type GitDojoFs } from "../filesystem/types";

/** Everything a command implementation needs to talk to isomorphic-git for one workspace. */
export interface GitContext {
  fs: GitDojoFs;
  /** Absolute repository directory inside the virtual filesystem. */
  dir: string;
  workspaceId: string;
  /** How the repository directory is presented to learners, e.g. `~/project`. */
  displayDir: string;
}
