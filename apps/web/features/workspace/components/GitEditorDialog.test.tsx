import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useGitEditorStore } from "../state/use-git-editor-store";
import { GitEditorDialog } from "./GitEditorDialog";

afterEach(() => {
  act(() => {
    useGitEditorStore.getState().answer({ action: "abort" });
  });
});

describe("GitEditorDialog", () => {
  it("shows the file Git opened and hands back the edited text", async () => {
    const user = userEvent.setup();
    render(<GitEditorDialog />);
    let decision: Promise<unknown> = Promise.resolve();
    act(() => {
      decision = useGitEditorStore
        .getState()
        .open({ file: "git-rebase-todo", purpose: "todo", content: "pick abc1234 wip\n" });
    });
    expect(await screen.findByRole("dialog")).toHaveAccessibleName(/git-rebase-todo/);
    const text = screen.getByLabelText("Rebase todo list");
    expect(text).toHaveValue("pick abc1234 wip\n");
    await user.clear(text);
    await user.type(text, "reword abc1234 wip");
    await user.click(screen.getByRole("button", { name: "Save and close" }));
    await expect(decision).resolves.toEqual({ action: "save", content: "reword abc1234 wip" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aborts with its button, shows a refusal, and ignores Escape", async () => {
    const user = userEvent.setup();
    render(<GitEditorDialog />);
    let decision: Promise<unknown> = Promise.resolve();
    act(() => {
      decision = useGitEditorStore.getState().open({
        file: "COMMIT_EDITMSG",
        purpose: "message",
        content: "wip\n",
        error: "Aborting commit due to empty commit message.",
      });
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("empty commit message");
    expect(screen.getByLabelText("Commit message")).toHaveAccessibleDescription(
      /empty commit message/,
    );
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abort rebase" }));
    await expect(decision).resolves.toEqual({ action: "abort" });
  });

  it("saves with Ctrl+Enter", async () => {
    const user = userEvent.setup();
    render(<GitEditorDialog />);
    let decision: Promise<unknown> = Promise.resolve();
    act(() => {
      decision = useGitEditorStore
        .getState()
        .open({ file: "COMMIT_EDITMSG", purpose: "message", content: "Add search\n" });
    });
    await screen.findByRole("dialog");
    await user.keyboard("{Control>}{Enter}{/Control}");
    await expect(decision).resolves.toEqual({ action: "save", content: "Add search\n" });
  });
});
