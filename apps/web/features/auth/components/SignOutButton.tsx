"use client";

import { Button } from "@gitdojo/ui";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { markSignOutIntent } from "../services/sign-out-intent";

/** Starts signing out, like the account menu's "Sign out". */
export function SignOutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      data-testid="account-sign-out"
      onClick={() => {
        markSignOutIntent();
        router.push("/auth/sign-out");
      }}
    >
      <LogOut aria-hidden="true" /> Sign out
    </Button>
  );
}
