"use client";

import { useEffect } from "react";
import { markReleaseSeen } from "../hooks/use-release-announcement";

/** Opening a release's "What's new" page marks it seen, so its banner is not shown again. */
export function MarkReleaseSeen({ version }: { version: string }) {
  useEffect(() => {
    markReleaseSeen(version);
  }, [version]);
  return null;
}
