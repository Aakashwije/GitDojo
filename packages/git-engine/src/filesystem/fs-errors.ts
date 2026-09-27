/** Checks the `code` property used by both LightningFS (`ENOENT`) and isomorphic-git (`NotFoundError`). */
export function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
