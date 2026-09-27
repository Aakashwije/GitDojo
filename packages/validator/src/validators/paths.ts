/** Lesson authors may write `./README.md`; repository state always uses `README.md`. */
export function normalizeLessonPath(path: string): string {
  return path.trim().replace(/^(\.\/|\/)+/, "");
}
