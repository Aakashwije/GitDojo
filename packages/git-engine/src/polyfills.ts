import { Buffer } from "buffer";

// isomorphic-git expects a Node-style global Buffer, which browsers do not provide.
// This module is imported before anything that loads isomorphic-git.
if (typeof globalThis.Buffer === "undefined") {
  globalThis.Buffer = Buffer;
}
