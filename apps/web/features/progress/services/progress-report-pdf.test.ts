// @vitest-environment node
import {
  applyProgressAction,
  buildProgressReport,
  emptyProgress,
  type ProgressCatalog,
  type ProgressReport,
} from "@gitdojo/progress";
import { jsPDF } from "jspdf";
import { describe, expect, it } from "vitest";
import {
  createProgressReportPdf,
  isPrintableName,
  renderProgressReport,
  REPORT_PAGE,
  reportFileName,
  toReportText,
  type LayoutBox,
} from "./progress-report-pdf";

const AT = new Date(2026, 9, 17, 10, 30).getTime();

const CATALOG: ProgressCatalog = {
  courses: [
    {
      id: "git-basics",
      slug: "git-basics",
      title: "Git Basics",
      description: "",
      difficulty: "beginner",
      lessons: [
        {
          id: "what-is-git",
          slug: "what-is-git",
          title: "What is Git?",
          type: "concept",
          number: 1,
        },
        { id: "git-init", slug: "git-init", title: "git init", type: "interactive", number: 2 },
      ],
    },
  ],
  lessons: [],
  challenges: [{ id: "lost-commit", title: "Lost Commit" }],
  practice: [
    { id: "tag-a-release", title: "Tag a Release", skill: "tags", difficulty: "beginner" },
  ],
  concepts: {
    "lesson:git-init": ["git-init"],
    "challenge:lost-commit": ["reflog"],
    "practice:tag-a-release": ["tags"],
  },
};

/** Draws `report` on a fresh, uncompressed A4 document so its text can be read back. */
function draw(report: ProgressReport, logo?: Parameters<typeof renderProgressReport>[2]) {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: false });
  const layout = renderProgressReport(doc, report, logo);
  return { layout, output: doc.output() };
}

function overlaps(a: LayoutBox, b: LayoutBox): boolean {
  const tolerance = 0.5;
  return (
    a.page === b.page &&
    a.x < b.x + b.width - tolerance &&
    b.x < a.x + a.width - tolerance &&
    a.y < b.y + b.height - tolerance &&
    b.y < a.y + a.height - tolerance
  );
}

/** Every box inside the printable area, and no two pieces of text on top of each other. */
function expectCleanLayout(boxes: LayoutBox[]) {
  for (const box of boxes) {
    expect(box.x, box.text).toBeGreaterThanOrEqual(REPORT_PAGE.margin - 0.5);
    expect(box.x + box.width, box.text).toBeLessThanOrEqual(
      REPORT_PAGE.width - REPORT_PAGE.margin + 0.5,
    );
    expect(box.y + box.height, box.text).toBeLessThanOrEqual(REPORT_PAGE.contentBottom + 0.5);
    if (box.page > 1) expect(box.y, box.text).toBeGreaterThanOrEqual(REPORT_PAGE.contentTop);
  }
  const texts = boxes.filter((box) => box.kind === "text" || box.kind === "bar");
  for (const [index, box] of texts.entries()) {
    for (const other of texts.slice(index + 1)) {
      expect(
        overlaps(box, other),
        `"${box.text ?? box.kind}" overlaps "${other.text ?? other.kind}"`,
      ).toBe(false);
    }
  }
}

function longReport(): ProgressReport {
  const base = buildProgressReport(emptyProgress(AT), CATALOG, {
    exportedAt: AT,
    learnerName: "Ada Lovelace",
  });
  return {
    ...base,
    summary: "Completed 40 lessons. 16 skills practiced hands-on, 3 of them mastered.",
    courses: Array.from({ length: 30 }, (_, index) => ({
      title: `Course ${String(index + 1)} with a fairly long title that has to wrap onto a second line of the page`,
      completed: index,
      total: 30,
      percent: Math.round((index / 30) * 100),
    })),
    skills: {
      practiced: Array.from({ length: 16 }, (_, index) => ({
        label: `Skill ${String(index + 1)}`,
        status: index % 5 === 0 ? ("mastered" as const) : ("practiced" as const),
        handsOn: index % 5 === 0 ? 3 : 1,
        available: 6,
      })),
      untouchedCount: 0,
      masteryRule: "Practiced: one. Mastered: three, one unguided.",
    },
    activity: Array.from({ length: 40 }, (_, index) => ({
      kind: "Lesson" as const,
      title: `Lesson ${String(index + 1)}`,
      context: "Undo and Recover",
      completedAt: AT - index * 86_400_000,
      reward: "+50 XP",
    })),
    commands: [{ command: "commit", uses: 120, successes: 110 }],
    nextSteps: [
      {
        title: "Sync with a Teammate's Push",
        reason: "Continue the course you started",
        url: "https://gitdojo.example/learn/remotes/sync-with-remote",
      },
    ],
  };
}

describe("report text helpers", () => {
  it("name the file after the export day", () => {
    expect(reportFileName(AT)).toBe("gitdojo-progress-2026-10-17.pdf");
  });

  it("fold punctuation the built-in fonts lack, and refuse unprintable names", () => {
    expect(toReportText("Teammate’s push — done…")).toBe("Teammate's push - done...");
    expect(toReportText("ok → next")).toBe("ok -> next");
    expect(isPrintableName("José Müller-Søren")).toBe(true);
    expect(isPrintableName("Aakash ආකාශ")).toBe(false);
    expect(isPrintableName("")).toBe(true);
  });
});

describe("renderProgressReport", () => {
  it("fits empty progress on one page, leaving out empty sections", () => {
    const report = buildProgressReport(emptyProgress(AT), CATALOG, { exportedAt: AT });
    const { layout, output } = draw(report);
    expect(layout.pages).toBe(1);
    expect(output).toContain("(Progress report)");
    expect(output).toContain("(GitDojo Learner)");
    expect(output).toContain("(Learn Git by doing.)");
    expect(output).toContain("Exported October 17, 2026");
    expect(output).toContain("(Page 1 of 1)");
    // Course totals are real even with nothing done.
    expect(output).toContain("(0 of 2 lessons · 0%)");
    for (const empty of ["Skills practiced", "Recent activity", "Most used Git commands"]) {
      expect(output).not.toContain(`(${empty})`);
    }
    expectCleanLayout(layout.boxes);
  });

  it("prints real progress: the name, counts, skills, activity and a working link", () => {
    let progress = emptyProgress(AT);
    for (const [index, action] of [
      {
        type: "complete",
        content: { kind: "lesson", id: "git-init", type: "interactive", courseId: "git-basics" },
      },
      { type: "complete", content: { kind: "challenge", id: "lost-commit" } },
      { type: "complete", content: { kind: "practice", id: "tag-a-release" } },
      { type: "command", command: "commit", ok: true },
    ].entries()) {
      progress = applyProgressAction(
        progress,
        action as Parameters<typeof applyProgressAction>[1],
        AT + index,
      );
    }
    const report = buildProgressReport(progress, CATALOG, {
      exportedAt: AT,
      learnerName: "Ada Lovelace",
      origin: "https://gitdojo.example",
    });
    const { layout, output } = draw(report);
    expect(output).toContain("(Ada Lovelace)");
    expect(output).toContain("(1 of 2 lessons · 50%)");
    expect(output).toContain("(Skills practiced)");
    expect(output).toContain("(Practiced)");
    expect(output).toContain("(Tag a Release)");
    expect(output).toContain("(No XP)");
    expect(output).toContain("(git commit)");
    expect(output).toMatch(/\/URI \(https:\/\/gitdojo\.example\/learn\/git-basics\/what-is-git\)/);
    expectCleanLayout(layout.boxes);
  });

  it("spreads a long report over several pages, numbered, with nothing clipped or overlapping", () => {
    const { layout, output } = draw(longReport());
    expect(layout.pages).toBeGreaterThanOrEqual(3);
    for (let page = 1; page <= layout.pages; page += 1) {
      expect(output).toContain(`(Page ${String(page)} of ${String(layout.pages)})`);
    }
    // Every course and activity row made it in.
    expect(output).toContain("(Course 30 with a fairly long title");
    expect(output).toContain("(Lesson 40)");
    expect(output).toContain("(Mastered)");
    // A section that runs onto the next page is named again there.
    // (PDF strings escape their parentheses.)
    expect(output).toMatch(/\((Course progress|Recent activity) \\\(continued\\\)\)/);
    expectCleanLayout(layout.boxes);
  });

  it("keeps the logo's proportions", () => {
    // A 1x1 transparent PNG, declared as 2126x740 artwork.
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const report = buildProgressReport(emptyProgress(AT), CATALOG, { exportedAt: AT });
    const image = draw(report, { dataUrl, width: 2126, height: 740 }).layout.boxes.find(
      (box) => box.kind === "image",
    );
    expect(image).toBeDefined();
    expect((image?.width ?? 0) / (image?.height ?? 1)).toBeCloseTo(2126 / 740, 3);
  });

  it("never contains email addresses, account or device ids, hints or workspace files", () => {
    let progress = {
      ...emptyProgress(AT, {
        owner: { kind: "account", accountId: "ada@example.com" },
        deviceId: "laptop-42",
      }),
    };
    progress = applyProgressAction(
      progress,
      {
        type: "hint",
        content: { kind: "lesson", id: "git-init" },
        objectiveId: "private-objective",
        index: 0,
      },
      AT,
    );
    const report = buildProgressReport(progress, CATALOG, { exportedAt: AT });
    const { output } = draw(report);
    for (const secret of ["ada@example.com", "laptop-42", "private-objective", "README.md"]) {
      expect(output).not.toContain(secret);
    }
  });

  it("creates a downloadable PDF file", async () => {
    const report = buildProgressReport(emptyProgress(AT), CATALOG, { exportedAt: AT });
    const { blob, pages } = await createProgressReportPdf(report);
    expect(pages).toBe(1);
    expect(blob.type).toBe("application/pdf");
    expect(new TextDecoder().decode((await blob.arrayBuffer()).slice(0, 5))).toBe("%PDF-");
  });
});
