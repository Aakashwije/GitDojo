"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@gitdojo/ui";
import { RotateCcw } from "lucide-react";
import { useState } from "react";

export interface ResetLessonButtonProps {
  /** Only ask for confirmation when there is work to lose. */
  confirm: boolean;
  onReset: () => Promise<void>;
  disabled?: boolean;
}

export function ResetLessonButton({ confirm, onReset, disabled }: ResetLessonButtonProps) {
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const reset = async () => {
    setResetting(true);
    try {
      await onReset();
      setOpen(false);
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled || resetting}
        onClick={() => {
          if (confirm) setOpen(true);
          else void reset();
        }}
      >
        <RotateCcw /> <span className="max-sm:sr-only">Reset</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Reset this lesson?</DialogTitle>
          <DialogDescription>
            The repository goes back to its starting state and your progress on this lesson is
            cleared.
          </DialogDescription>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" disabled={resetting} onClick={() => void reset()}>
              <RotateCcw /> Reset lesson
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
