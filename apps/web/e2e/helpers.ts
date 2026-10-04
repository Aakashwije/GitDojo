import { expect, type Page } from "@playwright/test";

export type WorkspaceTab = "Lesson" | "Editor" | "Terminal" | "Graph" | "Files";

/** Phones show one workspace panel at a time; switch to it before interacting. */
export async function show(page: Page, tab: WorkspaceTab, isMobile: boolean): Promise<void> {
  if (isMobile)
    await page
      .getByRole("navigation", { name: "Workspace panels" })
      .getByRole("button", { name: tab })
      .click();
}

/** Types one line into the terminal and submits it. */
export async function run(page: Page, command: string): Promise<void> {
  await page.getByTestId("terminal").click();
  await page.keyboard.type(command);
  await page.keyboard.press("Enter");
}

/** Waits until the terminal shows its prompt, i.e. the workspace is ready for commands. */
export async function waitForTerminal(page: Page, isMobile: boolean): Promise<void> {
  await show(page, "Terminal", isMobile);
  await expect(page.getByTestId("terminal")).toContainText("learner@gitdojo");
}

/** Runs a hands-on lesson's commands and waits for the completion dialog. */
export async function solveLesson(
  page: Page,
  commands: readonly string[],
  isMobile: boolean,
): Promise<void> {
  await waitForTerminal(page, isMobile);
  for (const command of commands) await run(page, command);
  await expect(page.getByRole("dialog")).toContainText(/Lesson Complete|Challenge Solved/);
}

/** Reads a dashboard total, e.g. `stat-xp`. */
export function stat(page: Page, name: string) {
  return page.getByTestId(`stat-${name}`);
}

/** Waits until progress changes have been written to IndexedDB, e.g. before a reload. */
export async function waitForProgressSaved(page: Page): Promise<void> {
  await expect(page.locator("html")).toHaveAttribute("data-progress", "saved");
}
