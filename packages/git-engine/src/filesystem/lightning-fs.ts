import FS from "@isomorphic-git/lightning-fs";
import { type GitDojoFs } from "./types";

export interface LightningFsOptions {
  /** Start from an empty database. Useful for tests. */
  wipe?: boolean;
}

/**
 * Creates the IndexedDB-backed filesystem. One instance is shared by every workspace;
 * isolation comes from each workspace living in its own `/gitdojo/<id>` directory.
 */
export function createLightningFs(name = "gitdojo", options: LightningFsOptions = {}): GitDojoFs {
  return new FS(name, { wipe: options.wipe ?? false });
}
