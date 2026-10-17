import "server-only";

import { createHash } from "node:crypto";
import {
  CAPSTONE_RUBRIC_VERSION,
  type AssessmentCriterionResult,
  type AssessmentEvidence,
  type AssessmentGrade,
  type GitObjectType,
} from "@gitdojo/shared-types";

const OID = /^[0-9a-f]{40}$/;
const MAX_OBJECTS = 512;
const MAX_BYTES = 2 * 1024 * 1024;

interface ObjectRecord {
  type: GitObjectType;
  bytes: Buffer;
}

interface CommitRecord {
  oid: string;
  tree: string;
  parents: string[];
  message: string;
}

function canonicalOid(type: GitObjectType, bytes: Buffer): string {
  return createHash("sha1")
    .update(`${type} ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex");
}

function checkedObjects(evidence: AssessmentEvidence): Map<string, ObjectRecord> {
  if (evidence.objects.length === 0 || evidence.objects.length > MAX_OBJECTS)
    throw new Error("invalid object count");
  let total = 0;
  const objects = new Map<string, ObjectRecord>();
  for (const object of evidence.objects) {
    if (!OID.test(object.oid) || !["blob", "tree", "commit"].includes(object.type))
      throw new Error("invalid object metadata");
    const bytes = Buffer.from(object.content, "base64");
    total += bytes.length;
    if (total > MAX_BYTES || canonicalOid(object.type, bytes) !== object.oid)
      throw new Error("invalid object content");
    if (objects.has(object.oid)) throw new Error("duplicate object");
    objects.set(object.oid, { type: object.type, bytes });
  }
  return objects;
}

function parseCommit(oid: string, object: ObjectRecord): CommitRecord {
  if (object.type !== "commit") throw new Error("expected commit");
  const text = object.bytes.toString("utf8");
  const split = text.indexOf("\n\n");
  if (split < 0) throw new Error("invalid commit");
  const headers = text.slice(0, split).split("\n");
  const tree = headers.find((line) => line.startsWith("tree "))?.slice(5);
  const parents = headers.filter((line) => line.startsWith("parent ")).map((line) => line.slice(7));
  if (!tree || !OID.test(tree) || parents.some((parent) => !OID.test(parent)))
    throw new Error("invalid commit links");
  return { oid, tree, parents, message: text.slice(split + 2).trim() };
}

function treeEntries(object: ObjectRecord): { name: string; oid: string; tree: boolean }[] {
  if (object.type !== "tree") throw new Error("expected tree");
  const entries: { name: string; oid: string; tree: boolean }[] = [];
  let offset = 0;
  while (offset < object.bytes.length) {
    const space = object.bytes.indexOf(0x20, offset);
    const nul = object.bytes.indexOf(0, space + 1);
    if (space < 0 || nul < 0 || nul + 21 > object.bytes.length) throw new Error("invalid tree");
    const mode = object.bytes.toString("ascii", offset, space);
    const name = object.bytes.toString("utf8", space + 1, nul);
    if (!name || name.includes("/") || name === "." || name === "..")
      throw new Error("invalid path");
    const oid = object.bytes.subarray(nul + 1, nul + 21).toString("hex");
    entries.push({ name, oid, tree: mode === "40000" || mode === "040000" });
    offset = nul + 21;
  }
  return entries;
}

function filesAt(
  objects: Map<string, ObjectRecord>,
  tree: string,
  prefix = "",
  depth = 0,
): Map<string, Buffer> {
  if (depth > 20) throw new Error("tree too deep");
  const object = objects.get(tree);
  if (!object) throw new Error("missing tree");
  const files = new Map<string, Buffer>();
  for (const entry of treeEntries(object)) {
    const child = objects.get(entry.oid);
    if (!child) throw new Error("missing tree object");
    const path = `${prefix}${entry.name}`;
    if (entry.tree) {
      for (const [name, bytes] of filesAt(objects, entry.oid, `${path}/`, depth + 1))
        files.set(name, bytes);
    } else {
      if (child.type !== "blob") throw new Error("tree entry is not a blob");
      files.set(path, child.bytes);
    }
  }
  return files;
}

function result(
  id: AssessmentCriterionResult["id"],
  passed: boolean,
  success: string,
  failure: string,
): AssessmentCriterionResult {
  return { id, passed, feedback: passed ? success : failure };
}

function isAncestor(
  ancestor: string,
  descendant: string,
  commits: ReadonlyMap<string, CommitRecord>,
): boolean {
  const pending = [descendant];
  const seen = new Set<string>();
  while (pending.length > 0) {
    const oid = pending.pop();
    if (!oid || seen.has(oid)) continue;
    if (oid === ancestor) return true;
    seen.add(oid);
    const commit = commits.get(oid);
    if (commit) pending.push(...commit.parents);
  }
  return false;
}

/** Grade only canonical Git objects. Browser booleans, counters and normalized snapshots are ignored. */
export function gradeCapstone(
  evidenceInput: unknown,
  attempt: { id: string; nonce: string },
): AssessmentGrade {
  const failed = (feedback: string): AssessmentGrade => ({
    passed: false,
    rubricVersion: CAPSTONE_RUBRIC_VERSION,
    criteria: [result("attempt", false, "", feedback)],
  });
  try {
    if (!evidenceInput || typeof evidenceInput !== "object")
      return failed("This submission does not belong to the active assessment attempt.");
    const candidate = evidenceInput as Record<string, unknown>;
    if (
      candidate.format !== "gitdojo-assessment-evidence" ||
      candidate.version !== 1 ||
      candidate.attemptId !== attempt.id ||
      typeof candidate.head !== "string" ||
      !OID.test(candidate.head) ||
      !Array.isArray(candidate.reflog) ||
      !candidate.reflog.every((oid) => typeof oid === "string" && OID.test(oid)) ||
      !Array.isArray(candidate.objects)
    )
      return failed("This submission does not belong to the active assessment attempt.");
    const evidence = candidate as unknown as AssessmentEvidence;
    const objects = checkedObjects(evidence);
    const commits = new Map<string, CommitRecord>();
    for (const [oid, object] of objects) {
      if (object.type === "commit") commits.set(oid, parseCommit(oid, object));
    }
    const head = commits.get(evidence.head);
    if (!head) return failed("The submitted repository has no verifiable HEAD commit.");

    const reachable = new Set<string>();
    const queue = [head.oid];
    while (queue.length > 0) {
      const oid = queue.pop();
      if (!oid || reachable.has(oid)) continue;
      const commit = commits.get(oid);
      if (!commit) throw new Error("missing commit");
      reachable.add(oid);
      queue.push(...commit.parents);
    }
    const reachableCommits: CommitRecord[] = [];
    for (const oid of reachable) {
      const commit = commits.get(oid);
      if (!commit) throw new Error("missing reachable commit");
      reachableCommits.push(commit);
    }
    const roots = reachableCommits.filter((commit) => commit.parents.length === 0);
    const expectedMarker = `gitdojo-capstone:${attempt.id}:${attempt.nonce}\n`;
    const root = roots.length === 1 ? roots[0] : undefined;
    const markerOk = Boolean(
      root &&
      filesAt(objects, root.tree).get(".gitdojo/attempt")?.toString("utf8") === expectedMarker,
    );
    const merge = reachableCommits.find((commit) => {
      if (new Set(commit.parents).size < 2) return false;
      const perspectives = commit.parents.map((parent) => {
        const parentCommit = commits.get(parent);
        if (!parentCommit) throw new Error("missing merge parent");
        const text = filesAt(objects, parentCommit.tree).get("project.txt")?.toString("utf8") ?? "";
        return {
          main: text.includes("main perspective"),
          feature: text.includes("feature perspective"),
        };
      });
      return (
        perspectives.some(({ main, feature }) => main && !feature) &&
        perspectives.some(({ main, feature }) => feature && !main)
      );
    });
    const finalFiles = filesAt(objects, head.tree);
    const project = finalFiles.get("project.txt")?.toString("utf8") ?? "";
    const mergeProject = merge
      ? (filesAt(objects, merge.tree).get("project.txt")?.toString("utf8") ?? "")
      : "";
    const conflictOk =
      mergeProject.includes("main perspective") &&
      mergeProject.includes("feature perspective") &&
      !/^(<{7}|={7}|>{7})/m.test(mergeProject) &&
      project.includes("main perspective") &&
      project.includes("feature perspective") &&
      !/^(<{7}|={7}|>{7})/m.test(project);
    const mistake = [...commits.values()].find((commit) => {
      const files = filesAt(objects, commit.tree);
      return (
        /mistake/i.test(commit.message) &&
        files.has("debug.log") &&
        Boolean(merge && isAncestor(merge.oid, commit.oid, commits))
      );
    });
    const reverted = reachableCommits.some(
      (commit) =>
        /^revert\b/i.test(commit.message) &&
        Boolean(mistake && isAncestor(mistake.oid, commit.oid, commits)),
    );
    const resetAway = Boolean(
      mistake && evidence.reflog.includes(mistake.oid) && !reachable.has(mistake.oid),
    );
    const recoveryOk = Boolean(mistake) && !finalFiles.has("debug.log") && (reverted || resetAway);

    const criteria: AssessmentCriterionResult[] = [
      result(
        "attempt",
        markerOk,
        "The repository is bound to this isolated attempt.",
        "The assessment starter commit is missing or does not belong to this attempt.",
      ),
      result(
        "commits",
        reachableCommits.length >= 5,
        "The history contains a meaningful sequence of commits.",
        "The history does not yet show enough distinct, committed stages of the work.",
      ),
      result(
        "branching",
        Boolean(merge),
        "The history contains a real merge with two parents.",
        "The final history does not demonstrate a completed branch merge.",
      ),
      result(
        "conflict",
        conflictOk,
        "The merged project preserves both required perspectives without conflict markers.",
        "The merged project does not yet preserve both required perspectives cleanly.",
      ),
      result(
        "recovery",
        recoveryOk,
        "The accidental debug change was recorded and safely recovered.",
        "The history does not yet provide evidence that the accidental debug change was recovered.",
      ),
    ];
    return {
      passed: criteria.every((criterion) => criterion.passed),
      rubricVersion: CAPSTONE_RUBRIC_VERSION,
      criteria,
    };
  } catch {
    return failed("The submitted Git object graph is incomplete or has been altered.");
  }
}
