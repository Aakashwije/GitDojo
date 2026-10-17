import { emptyProgress, type ProgressCatalog, type ProgressReport } from "@gitdojo/progress";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAccountSession } from "@/features/auth";
import { ProgressManagement } from "./components/ProgressManagement";
import { suggestedReportName } from "./components/ProgressReportExport";
import type * as ReportPdf from "./services/progress-report-pdf";
import { resetProgressStoreForTests, useProgressStore } from "./state/use-progress-store";

const pdf = vi.hoisted(() => ({
  create: vi.fn<(report: ProgressReport) => Promise<{ blob: Blob; pages: number }>>(),
}));

vi.mock("./services/progress-report-pdf", async (importOriginal) => ({
  ...(await importOriginal<typeof ReportPdf>()),
  createProgressReportPdf: pdf.create,
  loadReportLogo: () => Promise.resolve(undefined),
}));

const CATALOG: ProgressCatalog = {
  courses: [],
  lessons: [],
  challenges: [],
  practice: [],
  concepts: {},
};

const created = () =>
  Promise.resolve({ blob: new Blob(["%PDF-"], { type: "application/pdf" }), pages: 2 });

function load() {
  useProgressStore.setState({
    progress: emptyProgress(Date.now()),
    catalog: CATALOG,
    status: "ready",
    persistence: { mode: "saved" },
  });
  render(<ProgressManagement />);
}

let clicked: string[] = [];

beforeEach(() => {
  resetProgressStoreForTests();
  pdf.create.mockReset();
  clicked = [];
  URL.createObjectURL = vi.fn(() => "blob:report");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this.download);
  });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  useAccountSession.setState({ session: null });
});

describe("PDF progress report export", () => {
  it("replaces the JSON export, and waits for progress to load", () => {
    render(<ProgressManagement />);
    expect(screen.queryByTestId("export-progress")).toBeNull();
    expect(screen.queryByText(/JSON/)).toBeNull();
    expect(screen.getByTestId("export-report")).toBeDisabled();
  });

  it("exports anonymously without a name, as GitDojo Learner", async () => {
    pdf.create.mockImplementation(created);
    const user = userEvent.setup();
    load();
    await user.click(screen.getByRole("button", { name: "Export PDF report" }));
    const name = screen.getByLabelText(/Name on the report/);
    expect(name).toHaveValue("");
    expect(name).toHaveAttribute("placeholder", "GitDojo Learner");
    await user.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(pdf.create).toHaveBeenCalledTimes(1);
    expect(pdf.create.mock.calls[0]?.[0].learnerName).toBe("GitDojo Learner");
    expect(clicked).toEqual([expect.stringMatching(/^gitdojo-progress-\d{4}-\d{2}-\d{2}\.pdf$/)]);
    expect(screen.queryByTestId("report-dialog")).toBeNull();
    expect(screen.getByText("Progress report downloaded (2 pages).")).toBeInTheDocument();
  });

  it("puts an optional name on the report", async () => {
    pdf.create.mockImplementation(created);
    const user = userEvent.setup();
    load();
    await user.click(screen.getByTestId("export-report"));
    await user.type(screen.getByTestId("report-name"), "  Grace   Hopper ");
    await user.keyboard("{Enter}");
    expect(pdf.create.mock.calls[0]?.[0].learnerName).toBe("Grace Hopper");
  });

  it("refuses a name the PDF font cannot print, until it is changed", async () => {
    const user = userEvent.setup();
    load();
    await user.click(screen.getByTestId("export-report"));
    await user.type(screen.getByTestId("report-name"), "ආකාශ");
    expect(screen.getByTestId("report-name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/can't show yet/)).toBeInTheDocument();
    expect(screen.getByTestId("report-download")).toBeDisabled();
  });

  it("shows a busy state and creates one PDF however often it is pressed", async () => {
    let finish: (value: { blob: Blob; pages: number }) => void = () => undefined;
    pdf.create.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const user = userEvent.setup();
    load();
    await user.click(screen.getByTestId("export-report"));
    await user.click(screen.getByTestId("report-download"));
    const button = screen.getByTestId("report-download");
    expect(button).toHaveTextContent("Creating PDF…");
    expect(button).toBeDisabled();
    expect(screen.getByTestId("report-dialog")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Creating your progress report…")).toBeInTheDocument();
    await user.keyboard("{Enter}");
    expect(pdf.create).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ blob: new Blob(["%PDF-"]), pages: 1 });
      await Promise.resolve();
    });
    expect(screen.getByText("Progress report downloaded (1 page).")).toBeInTheDocument();
  });

  it("explains a failure plainly and lets the learner try again", async () => {
    pdf.create.mockRejectedValueOnce(new Error("canvas exploded")).mockImplementation(created);
    const user = userEvent.setup();
    load();
    await user.click(screen.getByTestId("export-report"));
    await user.click(screen.getByTestId("report-download"));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create the PDF. Your progress is unchanged. Please try again.",
    );
    expect(screen.queryByText(/canvas exploded/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(pdf.create).toHaveBeenCalledTimes(2);
    expect(clicked).toHaveLength(1);
  });
});

describe("suggestedReportName", () => {
  const signedIn = (name: string, email: string | null) =>
    ({ status: "signed-in", user: { name, email, picture: null } }) as const;

  it("suggests a real full name only, never one taken from the email or a username", () => {
    expect(suggestedReportName(signedIn("Ada Lovelace", "ada@example.com"))).toBe("Ada Lovelace");
    expect(suggestedReportName(signedIn("ada", "ada@example.com"))).toBe("");
    expect(suggestedReportName(signedIn("ada.lovelace", "ada.lovelace@example.com"))).toBe("");
    expect(suggestedReportName(signedIn("octocat", null))).toBe("");
    expect(suggestedReportName(signedIn("Ada Lovelace <ada@example.com>", null))).toBe("");
    expect(suggestedReportName({ status: "signed-out" })).toBe("");
    expect(suggestedReportName(null)).toBe("");
  });

  it("pre-fills a signed-in learner's full name, which they can change or clear", async () => {
    useAccountSession.setState({ session: signedIn("Ada Lovelace", "ada@example.com") });
    const user = userEvent.setup();
    load();
    await user.click(screen.getByTestId("export-report"));
    expect(screen.getByTestId("report-name")).toHaveValue("Ada Lovelace");
    expect(screen.queryByText("ada@example.com")).toBeNull();
  });
});
