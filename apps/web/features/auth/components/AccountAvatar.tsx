"use client";

import { cn } from "@gitdojo/ui";
import { useState } from "react";
import { initialsOf, type AccountUser } from "../types";

/** The profile picture, or the learner's initials when there is none (or it fails to load). */
export function AccountAvatar({
  user,
  size = "sm",
  className,
}: {
  user: AccountUser;
  size?: "sm" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dimensions = size === "lg" ? "size-16 text-h4" : "size-7 text-micro";
  return (
    <span
      aria-hidden="true"
      data-testid="account-avatar"
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-strong font-semibold text-white",
        dimensions,
        className,
      )}
    >
      {user.picture && !failed ? (
        // An external profile picture: next/image would need every identity provider's host.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.picture}
          alt=""
          referrerPolicy="no-referrer"
          className="size-full object-cover"
          onError={() => {
            setFailed(true);
          }}
        />
      ) : (
        initialsOf(user.name)
      )}
    </span>
  );
}
