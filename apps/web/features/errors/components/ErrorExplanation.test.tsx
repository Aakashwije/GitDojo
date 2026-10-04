import { TooltipProvider } from "@gitdojo/ui";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { explainOutcome } from "../services/explain-outcome";
import { useExplanationStore } from "../state/use-explanation-store";
import { ErrorExplanation } from "./ErrorExplanation";
import { EMPTY_REPOSITORY_STATE } from "@gitdojo/shared-types";

function renderPanel() {
  return render(
    <TooltipProvider>
      <ErrorExplanation />
    </TooltipProvider>,
  );
}

describe("ErrorExplanation", () => {
  beforeEach(() => {
    useExplanationStore.getState().dismiss();
  });

  it("shows nothing until a command deserves an explanation", () => {
    renderPanel();
    expect(screen.queryByTestId("error-explanation")).not.toBeInTheDocument();
  });

  it("explains a failed command on demand and links to a lesson", async () => {
    explainOutcome(
      "git status",
      {
        ok: false,
        output: "fatal: not a git repository (or any of the parent directories): .git",
        errorCode: "NOT_A_REPOSITORY",
      },
      EMPTY_REPOSITORY_STATE,
    );
    renderPanel();
    const panel = screen.getByTestId("error-explanation");
    expect(panel).toHaveTextContent("This folder is not a Git repository yet");
    expect(panel).toHaveAttribute("data-code", "NOT_A_REPOSITORY");

    await userEvent.click(screen.getByRole("button", { name: /Why did this happen/ }));
    expect(panel).toHaveTextContent("hidden .git folder");
    expect(
      screen.getByRole("link", { name: /Learn more: Initialize a Repository/ }),
    ).toHaveAttribute("href", "/learn/git-basics/git-init");

    await userEvent.click(screen.getByRole("button", { name: "Dismiss explanation" }));
    expect(screen.queryByTestId("error-explanation")).not.toBeInTheDocument();
  });

  it("clears after a command that needs no explanation, but not after `clear`", () => {
    explainOutcome(
      "git status",
      { ok: false, output: "x", errorCode: "NOT_A_REPOSITORY" },
      EMPTY_REPOSITORY_STATE,
    );
    explainOutcome("clear", { ok: true, output: "", clearScreen: true }, EMPTY_REPOSITORY_STATE);
    expect(useExplanationStore.getState().explanation?.code).toBe("NOT_A_REPOSITORY");
    explainOutcome("git init", { ok: true, output: "Initialized" }, EMPTY_REPOSITORY_STATE);
    expect(useExplanationStore.getState().explanation).toBeNull();
  });

  it("keeps command suggestions out of challenges", async () => {
    explainOutcome(
      "git switch main",
      {
        ok: false,
        output: "error: Your local changes ...\n\tprofile.js\nAborting",
        errorCode: "CHECKOUT_CONFLICT",
      },
      EMPTY_REPOSITORY_STATE,
    );
    render(
      <TooltipProvider>
        <ErrorExplanation spoilerFree />
      </TooltipProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: /Why did this happen/ }));
    expect(screen.getByTestId("error-explanation")).toHaveTextContent("would be lost");
    expect(screen.getByTestId("error-explanation")).not.toHaveTextContent("git stash");
    expect(screen.getByText(/Suggestions are hidden in challenges/)).toBeInTheDocument();
  });
});
