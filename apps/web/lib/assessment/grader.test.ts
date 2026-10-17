import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { type AssessmentEvidence, type AssessmentGitObject } from "@gitdojo/shared-types";
import { gradeCapstone } from "./grader";

vi.mock("server-only", () => ({}));

const ATTEMPT = { id: "11111111-1111-4111-8111-111111111111", nonce: "n".repeat(32) };

function object(type: AssessmentGitObject["type"], bytes: Buffer): AssessmentGitObject {
  const oid = createHash("sha1")
    .update(`${type} ${String(bytes.length)}\0`)
    .update(bytes)
    .digest("hex");
  return { oid, type, content: bytes.toString("base64") };
}

function blob(text: string) {
  return object("blob", Buffer.from(text));
}

function tree(entries: { name: string; object: AssessmentGitObject; tree?: boolean }[]) {
  const chunks = entries
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) =>
      Buffer.concat([
        Buffer.from(`${entry.tree ? "40000" : "100644"} ${entry.name}\0`),
        Buffer.from(entry.object.oid, "hex"),
      ]),
    );
  return object("tree", Buffer.concat(chunks));
}

function commit(root: AssessmentGitObject, parents: string[], message: string) {
  const headers = [
    `tree ${root.oid}`,
    ...parents.map((parent) => `parent ${parent}`),
    "author Learner <learner@gitdojo.local> 1 +0000",
    "committer Learner <learner@gitdojo.local> 1 +0000",
  ];
  return object("commit", Buffer.from(`${headers.join("\n")}\n\n${message}\n`));
}

function fixture(
  recovery: "revert" | "reset" = "revert",
  invalidHistory = false,
): AssessmentEvidence {
  const objects: AssessmentGitObject[] = [];
  const add = <T extends AssessmentGitObject>(value: T): T => (objects.push(value), value);
  const marker = add(blob(`gitdojo-capstone:${ATTEMPT.id}:${ATTEMPT.nonce}\n`));
  const markerTree = add(tree([{ name: "attempt", object: marker }]));
  const baseProject = add(blob("shared foundation\n"));
  const baseTree = add(
    tree([
      { name: ".gitdojo", object: markerTree, tree: true },
      { name: "project.txt", object: baseProject },
    ]),
  );
  const root = add(commit(baseTree, [], "Start GitDojo capstone"));
  const featureProject = add(
    blob(
      invalidHistory
        ? "shared foundation\nmain perspective\nfeature perspective\npremature combination\n"
        : "shared foundation\nfeature perspective\n",
    ),
  );
  const featureTree = add(
    tree([
      { name: ".gitdojo", object: markerTree, tree: true },
      { name: "project.txt", object: featureProject },
    ]),
  );
  const feature = add(commit(featureTree, [root.oid], "Develop feature"));
  const mainProject = add(blob("shared foundation\nmain perspective\n"));
  const mainTree = add(
    tree([
      { name: ".gitdojo", object: markerTree, tree: true },
      { name: "project.txt", object: mainProject },
    ]),
  );
  const main = add(commit(mainTree, [root.oid], "Update main"));
  const mergedProject = add(blob("shared foundation\nmain perspective\nfeature perspective\n"));
  const mergedTree = add(
    tree([
      { name: ".gitdojo", object: markerTree, tree: true },
      { name: "project.txt", object: mergedProject },
    ]),
  );
  const merge = add(commit(mergedTree, [main.oid, feature.oid], "Merge feature"));
  const debug = add(blob("temporary debug output\n"));
  const mistakeTree = add(
    tree([
      { name: ".gitdojo", object: markerTree, tree: true },
      { name: "debug.log", object: debug },
      { name: "project.txt", object: mergedProject },
    ]),
  );
  const mistake = add(commit(mistakeTree, [merge.oid], "Mistake: commit debug log"));
  const recovered = add(
    commit(
      mergedTree,
      recovery === "revert" ? [mistake.oid] : [merge.oid],
      recovery === "revert" ? "Revert accidental debug log" : "Document recovery",
    ),
  );
  return {
    format: "gitdojo-assessment-evidence",
    version: 1,
    attemptId: ATTEMPT.id,
    head: recovered.oid,
    reflog: recovery === "reset" ? [mistake.oid] : [],
    objects,
  };
}

describe("gradeCapstone", () => {
  it("passes a valid merge followed by a revert", () => {
    const grade = gradeCapstone(fixture(), ATTEMPT);
    expect(grade.passed).toBe(true);
    expect(grade.criteria).toHaveLength(5);
  });

  it("accepts reset as a valid recovery alternative", () => {
    expect(gradeCapstone(fixture("reset"), ATTEMPT).passed).toBe(true);
  });

  it("rejects a merge whose parents do not demonstrate conflicting perspectives", () => {
    const grade = gradeCapstone(fixture("revert", true), ATTEMPT);
    expect(grade.passed).toBe(false);
    expect(grade.criteria.find((item) => item.id === "branching")?.passed).toBe(false);
  });

  it("rejects tampered canonical object content", () => {
    const evidence = fixture();
    const first = evidence.objects[0];
    if (!first) throw new Error("fixture has no objects");
    first.content = Buffer.from("tampered").toString("base64");
    const grade = gradeCapstone(evidence, ATTEMPT);
    expect(grade.passed).toBe(false);
    expect(grade.criteria[0]?.feedback).toContain("altered");
  });

  it("rejects evidence copied from another isolated attempt", () => {
    const grade = gradeCapstone(fixture(), { ...ATTEMPT, nonce: "x".repeat(32) });
    expect(grade.passed).toBe(false);
    expect(grade.criteria.find((item) => item.id === "attempt")?.passed).toBe(false);
  });

  it("returns actionable rubric feedback without an exact command", () => {
    const evidence = fixture();
    const project = evidence.objects.find((item) =>
      Buffer.from(item.content, "base64").toString("utf8").includes("feature perspective"),
    );
    if (!project) throw new Error("fixture has no project blob");
    project.content = Buffer.from("invalid").toString("base64");
    const grade = gradeCapstone(evidence, ATTEMPT);
    expect(grade.passed).toBe(false);
    expect(grade.criteria.flatMap((item) => item.feedback)).not.toContain("git ");
  });
});
