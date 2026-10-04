"use client";

import { IconButton } from "@gitdojo/ui";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

export interface NavItem {
  label: string;
  href: string;
  external: boolean;
}

/** The main navigation on phones, where the inline links do not fit. */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
  };

  return (
    <div className="sm:hidden">
      <IconButton
        ref={button}
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((value) => !value);
        }}
      >
        {open ? <X /> : <Menu />}
      </IconButton>
      <nav
        id={id}
        aria-label="Main"
        hidden={!open}
        className="absolute inset-x-0 top-14 border-b border-border-subtle bg-app px-4 py-3 shadow-xl shadow-black/40"
      >
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.label}>
              {item.external ? (
                <a
                  href={item.href}
                  className="block rounded-md px-3 py-2.5 text-body text-fg-secondary hover:bg-hover hover:text-fg"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  href={item.href}
                  onClick={close}
                  className="block rounded-md px-3 py-2.5 text-body text-fg-secondary hover:bg-hover hover:text-fg"
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
