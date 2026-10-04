import { cn } from "@gitdojo/ui";
import { CircleAlert, Info } from "lucide-react";

/** Why the learner is back on the sign-in page. Generic wording: no provider details. */
const NOTICES = {
  cancelled: { tone: "info", text: "Sign-in was cancelled. You can try again whenever you like." },
  failed: { tone: "error", text: "We couldn't sign you in. Please try again." },
  expired: { tone: "info", text: "Your session has ended. Please sign in again." },
} as const;

export type AuthNoticeStatus = keyof typeof NOTICES;

export function isAuthNoticeStatus(value: unknown): value is AuthNoticeStatus {
  return typeof value === "string" && value in NOTICES;
}

export function AuthNotice({ status }: { status: string | undefined }) {
  if (!isAuthNoticeStatus(status)) return null;
  const { tone, text } = NOTICES[status];
  const Icon = tone === "error" ? CircleAlert : Info;
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      data-testid="auth-notice"
      data-status={status}
      className={cn(
        "mb-5 flex items-start gap-2 rounded-md border px-3 py-2.5 text-small text-fg",
        tone === "error"
          ? "border-danger/30 bg-danger-soft"
          : "border-accent-border bg-accent-soft",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "error" ? "text-danger" : "text-accent")}
        aria-hidden="true"
      />
      {text}
    </p>
  );
}
