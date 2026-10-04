/** What the browser is told about the learner's account. Never contains tokens. */
export interface AccountUser {
  /** Best available display name: full name, username or the email's local part. */
  name: string;
  email: string | null;
  /** An https avatar URL from the profile, if any. */
  picture: string | null;
}

export type AccountSession =
  /** Sign-in is not set up on this site; everything else works without an account. */
  | { status: "unconfigured" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: AccountUser };

/** Two-letter initials for the avatar fallback: "Ada Lovelace" → "AL", "octocat" → "OC". */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s._@-]+/)
    .filter(Boolean);
  const first = words[0] ?? "";
  const second = words[1] ?? "";
  const initials = second ? `${first.charAt(0)}${second.charAt(0)}` : first.slice(0, 2);
  return initials.toUpperCase() || "?";
}
