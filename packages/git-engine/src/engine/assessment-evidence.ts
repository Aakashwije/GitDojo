import { type AssessmentEvidence } from "@gitdojo/shared-types";
import { Buffer } from "buffer";
import git from "isomorphic-git";
import { readSnapshot } from "../commands/snapshot";
import { type GitContext } from "./context";

const OID = /^[0-9a-f]{40}$/;

/** Export canonical objects for server grading. No client-side grade is included or trusted. */
export async function assessmentEvidence(
  ctx: GitContext,
  attemptId: string,
): Promise<AssessmentEvidence> {
  const snapshot = await readSnapshot(ctx);
  if (!snapshot.head || !OID.test(snapshot.head)) throw new Error("The assessment has no commit");
  const roots = [snapshot.head, ...snapshot.reflog.map((entry) => entry.oid)].filter((oid) =>
    OID.test(oid),
  );
  const pending = [...new Set(roots)];
  const seen = new Set<string>();
  const objects: AssessmentEvidence["objects"] = [];

  while (pending.length > 0) {
    const oid = pending.pop();
    if (!oid || seen.has(oid)) continue;
    seen.add(oid);
    // Exact canonical bytes are required for independent server-side hash verification. The
    // typed readers parse trees and commits, so they cannot preserve those bytes.
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const raw = await git.readObject({ fs: ctx.fs, dir: ctx.dir, oid, format: "content" });
    if (raw.type !== "blob" && raw.type !== "tree" && raw.type !== "commit") continue;
    if (!(raw.object instanceof Uint8Array)) throw new Error("Git returned a non-canonical object");
    objects.push({
      oid,
      type: raw.type,
      content: Buffer.from(raw.object).toString("base64"),
    });
    if (raw.type === "commit") {
      const parsed = await git.readCommit({ fs: ctx.fs, dir: ctx.dir, oid });
      pending.push(parsed.commit.tree, ...parsed.commit.parent);
    } else if (raw.type === "tree") {
      const parsed = await git.readTree({ fs: ctx.fs, dir: ctx.dir, oid });
      pending.push(...parsed.tree.map((entry) => entry.oid));
    }
  }
  return {
    format: "gitdojo-assessment-evidence",
    version: 1,
    attemptId,
    head: snapshot.head,
    reflog: roots.slice(1),
    objects,
  };
}
