import { EMPTY_REPOSITORY_STATE } from "@gitdojo/shared-types";
import { TooltipProvider } from "@gitdojo/ui";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRepositoryStore } from "@/features/repository";
import { type WorkspaceFileActions } from "../services/editor-controller";
import { useEditorStore } from "../state/use-editor-store";
import { EditorView } from "./EditorView";
import { FileExplorer } from "./FileExplorer";

// Monaco cannot run in jsdom; a textarea stands in for it.
vi.mock("next/dynamic", () => ({
  default: () =>
    function FakeEditor(props: { value: string; label: string; onChange: (v: string) => void }) {
      return (
        <textarea
          aria-label={props.label}
          value={props.value}
          onChange={(event) => {
            props.onChange(event.target.value);
          }}
        />
      );
    },
}));

const withTooltips = (ui: ReactElement) => render(<TooltipProvider>{ui}</TooltipProvider>);

describe("FileExplorer", () => {
  it("shows folders, files and status letters, and opens files", async () => {
    const onOpen = vi.fn();
    withTooltips(
      <FileExplorer
        files={[
          {
            path: "src/auth.ts",
            exists: true,
            indicator: { letter: "M", tone: "warning", label: "Modified" },
          },
          {
            path: "README.md",
            exists: true,
            indicator: { letter: "A", tone: "success", label: "Staged · new file" },
          },
          {
            path: "old.txt",
            exists: false,
            indicator: { letter: "D", tone: "danger", label: "Deleted" },
          },
        ]}
        activePath={null}
        readOnly={false}
        onOpen={onOpen}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    const tree = screen.getByRole("tree", { name: "Project files" });
    expect(within(tree).getByText("src")).toBeInTheDocument();
    const auth = within(tree).getByTitle("Open src/auth.ts");
    await userEvent.click(auth);
    expect(onOpen).toHaveBeenCalledWith("src/auth.ts");
    expect(within(tree).getByTitle("old.txt was deleted from the working tree")).toBeDisabled();
    expect(screen.getAllByTestId("file-status").map((node) => node.dataset.letter)).toEqual([
      "M",
      "D",
      "A",
    ]);

    // Collapsing a folder hides its files.
    await userEvent.click(within(tree).getByText("src"));
    expect(within(tree).queryByTitle("Open src/auth.ts")).not.toBeInTheDocument();
  });

  it("creates files and shows why a name was refused", async () => {
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unsafe path "../x": path traversal is not allowed'))
      .mockResolvedValueOnce(undefined);
    withTooltips(
      <FileExplorer
        files={[]}
        activePath={null}
        readOnly={false}
        onOpen={vi.fn()}
        onCreate={onCreate}
        onDelete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "New file" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New file name" }), "../x{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("path traversal is not allowed");
    await userEvent.clear(screen.getByRole("textbox", { name: "New file name" }));
    await userEvent.type(screen.getByRole("textbox", { name: "New file name" }), "notes.md{Enter}");
    expect(onCreate).toHaveBeenLastCalledWith("notes.md");
    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "New file name" })).not.toBeInTheDocument();
    });
  });

  it("hides editing actions when read-only", () => {
    withTooltips(
      <FileExplorer
        files={[{ path: "a.txt", exists: true, indicator: null }]}
        activePath={null}
        readOnly
        onOpen={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "New file" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete a.txt" })).not.toBeInTheDocument();
  });
});

describe("EditorView", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    useRepositoryStore.getState().setWorkspace("test");
    useRepositoryStore.getState().setRepositoryState({
      ...EMPTY_REPOSITORY_STATE,
      initialized: true,
      files: [{ path: "README.md", status: "committed" }],
    });
  });

  it("opens a file from the explorer, edits it and saves", async () => {
    const disk = new Map([["README.md", "# Hello\n"]]);
    const files: WorkspaceFileActions = {
      readFile: (path) => Promise.resolve(disk.get(path) ?? ""),
      saveFile: vi.fn((path: string, content: string) => {
        disk.set(path, content);
        return Promise.resolve();
      }),
      createFile: vi.fn(),
      deleteFile: vi.fn(),
    };
    withTooltips(<EditorView files={files} />);
    expect(screen.getByText("No file open")).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("Open README.md"));
    const editor = await screen.findByRole("textbox", { name: "Editing README.md" });
    expect(editor).toHaveValue("# Hello\n");
    expect(screen.getByRole("tab", { name: /README\.md/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.type(editor, "!");
    expect(screen.getByTestId("editor-tab")).toHaveAttribute("data-dirty", "true");
    await waitFor(() => {
      expect(disk.get("README.md")).toBe("# Hello\n!");
    });
    await waitFor(() => {
      expect(screen.getByTestId("editor-save-status")).toHaveTextContent("Saved");
    });
  });
});
