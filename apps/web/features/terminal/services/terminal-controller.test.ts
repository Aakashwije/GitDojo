import { describe, expect, it, vi } from "vitest";
import { TerminalController, type TerminalSurface } from "./terminal-controller";
import { type TerminalExecutor } from "./terminal-executor";

// eslint-disable-next-line no-control-regex
const strip = (text: string) => text.replace(/\x1b(\[[0-9;?]*[A-Za-z]|[78])/g, "");

function setup(executor?: TerminalExecutor) {
  const writes: string[] = [];
  const clear = vi.fn();
  const surface: TerminalSurface = {
    write: (data) => writes.push(data),
    clear,
    cols: 120,
  };
  let history: string[] = [];
  const run =
    executor ??
    vi.fn<TerminalExecutor>((input) =>
      Promise.resolve({ text: `ran ${input}`, plainText: `ran ${input}`, clearScreen: false }),
    );
  const controller = new TerminalController(surface, {
    executor: run,
    getHistory: () => history,
    pushHistory: (line) => {
      history = [...history, line];
    },
  });
  const type = async (text: string) => {
    for (const char of text) await controller.handleData(char);
  };
  return { controller, clear, writes, run, type, output: () => strip(writes.join("")) };
}

describe("TerminalController", () => {
  it("ignores input until started", async () => {
    const { controller, run } = setup();
    await controller.handleData("x");
    await controller.handleData("\r");
    expect(run).not.toHaveBeenCalled();
  });

  it("executes a typed command and prints the output", async () => {
    const { controller, run, type, output } = setup();
    controller.start("Welcome");
    await type("git status\r");
    expect(run).toHaveBeenCalledWith("git status");
    expect(output()).toContain("ran git status");
    expect(output()).toMatch(/Welcome/);
  });

  it("drops buffered input when the terminal restarts", async () => {
    let finish: () => void = () => undefined;
    const run = vi.fn<TerminalExecutor>(
      () =>
        new Promise((resolve) => {
          finish = () => {
            resolve({ text: "", plainText: "", clearScreen: false });
          };
        }),
    );
    const { controller, type } = setup(run);
    controller.start();
    await type("one");
    const first = controller.handleData("\r");
    await type("two\r");
    controller.restart();
    finish();
    await first;
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not execute blank lines", async () => {
    const { controller, run, type } = setup();
    controller.start();
    await type("   \r");
    expect(run).not.toHaveBeenCalled();
  });

  it("recalls history with the arrow keys", async () => {
    const { controller, run, type } = setup();
    controller.start();
    await type("git init\r");
    await controller.handleData("\x1b[A");
    await controller.handleData("\r");
    expect(run).toHaveBeenLastCalledWith("git init");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("cancels the line with Ctrl+C", async () => {
    const { controller, run, type, output } = setup();
    controller.start();
    await type("git sta");
    await controller.handleData("\x03");
    await controller.handleData("\r");
    expect(run).not.toHaveBeenCalled();
    expect(output()).toContain("^C");
  });

  it("clears the screen when the command asks for it", async () => {
    const { controller, clear, type } = setup(() =>
      Promise.resolve({ text: "", plainText: "", clearScreen: true }),
    );
    controller.start();
    await type("clear\r");
    expect(clear).toHaveBeenCalled();
  });

  it("buffers input typed while a command runs and replays it in order", async () => {
    let finish: () => void = () => undefined;
    const executor = vi.fn<TerminalExecutor>((input) =>
      input === "git init"
        ? new Promise((resolve) => {
            finish = () => {
              resolve({ text: "init done", plainText: "init done", clearScreen: false });
            };
          })
        : Promise.resolve({ text: `ran ${input}`, plainText: `ran ${input}`, clearScreen: false }),
    );
    const { controller, type, output } = setup(executor);
    controller.start();
    await type("git init");
    const pending = controller.handleData("\r");
    expect(controller.isBusy).toBe(true);
    // Typed while `git init` runs: nothing executes or echoes yet...
    await type("git add .\r");
    await type("git status\r");
    expect(executor).toHaveBeenCalledTimes(1);
    expect(output()).not.toContain("git add");

    // ...and once it finishes, the typeahead runs in order.
    finish();
    await pending;
    expect(executor.mock.calls.map(([input]) => input)).toEqual([
      "git init",
      "git add .",
      "git status",
    ]);
    const text = output();
    expect(text.indexOf("init done")).toBeLessThan(text.indexOf("ran git add ."));
    expect(text.indexOf("ran git add .")).toBeLessThan(text.indexOf("ran git status"));
  });

  it("stays usable if the executor rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { controller, type, output } = setup(() => Promise.reject(new Error("boom")));
    controller.start();
    await type("git init\r");
    expect(controller.isBusy).toBe(false);
    expect(output()).toContain("something went wrong");
    expect(output()).not.toContain("boom");
  });
});
