import { createLightningFs } from "../filesystem/lightning-fs";
import { type GitDojoFs } from "../filesystem/types";

let counter = 0;

/** A fresh, isolated LightningFS database per call (backed by fake-indexeddb in tests). */
export function createTestFs(): GitDojoFs {
  counter += 1;
  return createLightningFs(`gitdojo-test-${String(Date.now())}-${String(counter)}`, { wipe: true });
}
