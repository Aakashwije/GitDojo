import { normalizeHints } from "@gitdojo/hints";
import { type LessonObjective } from "@gitdojo/shared-types";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { HintPanel } from "./HintPanel";
import { ObjectiveList } from "./ObjectiveList";
import { RichText } from "./RichText";

const objectives: LessonObjective[] = [
  {
    id: "initialize",
    description: "Initialize the repository.",
    validator: { type: "repository_initialized" },
  },
  {
    id: "stage",
    description: "Stage README.md.",
    validator: { type: "file_staged", file: "README.md" },
  },
  { id: "commit", description: "Create your first commit.", validator: { type: "commit_exists" } },
];

describe("ObjectiveList", () => {
  it("marks completed, current and upcoming objectives with text, not only color", () => {
    render(
      <ObjectiveList objectives={objectives} completedIds={["initialize"]} currentId="stage" />,
    );
    expect(screen.getByTestId("objective-initialize")).toHaveAttribute("data-state", "completed");
    expect(screen.getByTestId("objective-stage")).toHaveAttribute("aria-current", "step");
    expect(screen.getByTestId("objective-commit")).toHaveAttribute("data-state", "upcoming");
    expect(screen.getByText("(Completed)", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });
});

describe("HintPanel", () => {
  const hints = normalizeHints(["First.", "Second.", "Try `git init`."]);
  const state = (revealedHints: number) => ({ objectiveId: "init", revealedHints, totalHints: 3 });

  it("reveals hints one at a time, labelled by level", async () => {
    const onReveal = vi.fn();
    const { rerender } = render(<HintPanel hints={hints} state={undefined} onReveal={onReveal} />);
    expect(screen.getByText("Need help?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show a hint" }));
    expect(onReveal).toHaveBeenCalledOnce();

    rerender(<HintPanel hints={hints} state={state(2)} onReveal={onReveal} />);
    expect(screen.getByText("Hint 2 of 3")).toBeInTheDocument();
    expect(screen.getAllByTestId("hint").map((hint) => hint.dataset.level)).toEqual(["1", "2"]);
    expect(screen.getByText("Concept")).toBeInTheDocument();
    expect(screen.getByText("Command")).toBeInTheDocument();

    rerender(<HintPanel hints={hints} state={state(3)} onReveal={onReveal} />);
    expect(screen.getByText("Answer")).toBeInTheDocument();
    expect(screen.getByText("git init").tagName).toBe("CODE");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("asks before revealing the exact command", async () => {
    const onReveal = vi.fn();
    render(<HintPanel hints={hints} state={state(2)} onReveal={onReveal} />);
    await userEvent.click(screen.getByRole("button", { name: "Show the answer" }));
    expect(onReveal).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "Show the answer?" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.queryByRole("group", { name: "Show the answer?" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show the answer" }));
    await userEvent.click(screen.getByTestId("confirm-answer"));
    expect(onReveal).toHaveBeenCalledOnce();
  });

  it("says what is still missing, even without hints", () => {
    render(
      <HintPanel
        hints={[]}
        state={undefined}
        onReveal={vi.fn()}
        missing="README.md is not staged."
      />,
    );
    expect(screen.getByTestId("hint-missing")).toHaveTextContent(
      "Not yet: README.md is not staged.",
    );
  });
});

describe("RichText", () => {
  it("renders paragraphs, inline code and bold text", () => {
    render(<RichText text={"Use `git add` to **stage**.\n\nSecond paragraph."} />);
    expect(screen.getByText("git add").tagName).toBe("CODE");
    expect(screen.getByText("stage").tagName).toBe("STRONG");
    expect(screen.getByText("Second paragraph.")).toBeInTheDocument();
  });
});

describe("RichText lists", () => {
  it("renders a paragraph of `- ` lines as a bullet list", () => {
    render(<RichText text={"Intro.\n\n- One `git init`\n- Two"} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["One git init", "Two"]);
    expect(screen.getByText("git init").tagName).toBe("CODE");
  });
});
