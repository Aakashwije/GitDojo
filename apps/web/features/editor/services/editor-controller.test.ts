import { FileNotFoundError } from "@gitdojo/git-engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorStore } from "../state/use-editor-store";
import { EditorController, type WorkspaceFileActions } from "./editor-controller";

/** An in-memory workspace standing in for the learning session. */
function fakeFiles(initial: Record<string, string>) {
  const disk = new Map(Object.entries(initial));
  const files: WorkspaceFileActions = {
    readFile: vi.fn((path: string) => {
      const content = disk.get(path);
      return content === undefined
        ? Promise.reject(new FileNotFoundError(path))
        : Promise.resolve(content);
    }),
    saveFile: vi.fn((path: string, content: string) => {
      disk.set(path, content);
      return Promise.resolve();
    }),
    createFile: vi.fn((path: string) => {
      if (disk.has(path)) return Promise.reject(new Error(`${path} already exists`));
      disk.set(path, "");
      return Promise.resolve();
    }),
    deleteFile: vi.fn((path: string) => {
      disk.delete(path);
      return Promise.resolve();
    }),
  };
  return { disk, files };
}

const tab = (path: string) => useEditorStore.getState().tabs.find((t) => t.path === path);

describe("EditorController", () => {
  beforeEach(() => {
    useEditorStore.getState().reset();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a file and shows the editor", async () => {
    const { files } = fakeFiles({ "README.md": "# Hi\n" });
    const controller = new EditorController(files);
    useEditorStore.getState().openFile("README.md");
    expect(useEditorStore.getState().view).toBe("editor");
    expect(tab("README.md")?.status).toBe("loading");
    await controller.loadPending();
    expect(tab("README.md")).toMatchObject({ status: "ready", saved: "# Hi\n", draft: "# Hi\n" });
  });

  it("saves after a pause in typing, once", async () => {
    const { disk, files } = fakeFiles({ "a.txt": "one\n" });
    const controller = new EditorController(files, useEditorStore, 400);
    useEditorStore.getState().openFile("a.txt");
    await controller.loadPending();

    controller.change("a.txt", "one\nt");
    controller.change("a.txt", "one\ntwo\n");
    expect(tab("a.txt")?.draft).toBe("one\ntwo\n");
    expect(files.saveFile).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(400);
    expect(files.saveFile).toHaveBeenCalledTimes(1);
    expect(disk.get("a.txt")).toBe("one\ntwo\n");
    expect(tab("a.txt")).toMatchObject({ saved: "one\ntwo\n", saving: false });
  });

  it("flushes pending saves immediately", async () => {
    const { disk, files } = fakeFiles({ "a.txt": "x" });
    const controller = new EditorController(files);
    useEditorStore.getState().openFile("a.txt");
    await controller.loadPending();
    controller.change("a.txt", "y");
    await controller.flush();
    expect(disk.get("a.txt")).toBe("y");
  });

  it("reloads clean tabs after a command changes the file, but keeps unsaved typing", async () => {
    const { disk, files } = fakeFiles({ "a.txt": "mine", "b.txt": "b" });
    const controller = new EditorController(files);
    const store = useEditorStore.getState();
    store.openFile("a.txt");
    store.openFile("b.txt");
    await controller.loadPending();

    controller.change("b.txt", "typing…");
    disk.set("a.txt", "restored");
    disk.set("b.txt", "changed underneath");
    await controller.refresh();
    expect(tab("a.txt")?.draft).toBe("restored");
    expect(tab("b.txt")?.draft).toBe("typing…");
  });

  it("marks a tab missing when its file disappears, and recovers when it returns", async () => {
    const { disk, files } = fakeFiles({ "a.txt": "x" });
    const controller = new EditorController(files);
    useEditorStore.getState().openFile("a.txt");
    await controller.loadPending();
    disk.delete("a.txt");
    await controller.refresh();
    expect(tab("a.txt")?.status).toBe("missing");
    disk.set("a.txt", "back");
    await controller.refresh();
    expect(tab("a.txt")).toMatchObject({ status: "ready", draft: "back" });
  });

  it("creates, opens and deletes files", async () => {
    const { disk, files } = fakeFiles({});
    const controller = new EditorController(files);
    await controller.create("notes.md");
    expect(disk.get("notes.md")).toBe("");
    expect(useEditorStore.getState().activePath).toBe("notes.md");
    expect(tab("notes.md")?.status).toBe("ready");

    await controller.remove("notes.md");
    expect(disk.has("notes.md")).toBe(false);
    expect(tab("notes.md")).toBeUndefined();
  });

  it("saves before closing a tab and activates its neighbour", async () => {
    const { disk, files } = fakeFiles({ "a.txt": "a", "b.txt": "b" });
    const controller = new EditorController(files);
    const store = useEditorStore.getState();
    store.openFile("a.txt");
    store.openFile("b.txt");
    await controller.loadPending();
    controller.change("b.txt", "bb");
    await controller.close("b.txt");
    expect(disk.get("b.txt")).toBe("bb");
    expect(useEditorStore.getState().activePath).toBe("a.txt");
  });

  it("keeps the draft and reports the error when a save fails", async () => {
    const { files } = fakeFiles({ "a.txt": "a" });
    vi.mocked(files.saveFile).mockRejectedValueOnce(new Error("disk full"));
    const controller = new EditorController(files);
    useEditorStore.getState().openFile("a.txt");
    await controller.loadPending();
    controller.change("a.txt", "b");
    await controller.save("a.txt");
    expect(tab("a.txt")).toMatchObject({ draft: "b", saved: "a", error: "disk full" });
  });
});
