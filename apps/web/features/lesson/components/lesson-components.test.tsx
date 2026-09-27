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
  it("reveals hints one at a time", async () => {
    const onReveal = vi.fn();
    const hints = ["First.", "Second.", "Try `git init`."];
    const { rerender } = render(<HintPanel hints={hints} revealed={0} onReveal={onReveal} />);
    expect(screen.getByText("Need help?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reveal hint" }));
    expect(onReveal).toHaveBeenCalledOnce();

    rerender(<HintPanel hints={hints} revealed={3} onReveal={onReveal} />);
    expect(screen.getByText("Hint 3 of 3")).toBeInTheDocument();
    expect(screen.getByText("git init").tagName).toBe("CODE");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
