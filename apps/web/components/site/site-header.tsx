import { Button } from "@gitdojo/ui";
import Link from "next/link";
import { AccountControls } from "@/features/auth";
import { SITE } from "@/lib/site";
import { GitHubIcon } from "./github-icon";
import { Logo } from "./logo";
import { MobileNav, type NavItem } from "./mobile-nav";

const NAV_ITEMS: readonly NavItem[] = [
  { label: "Learn", href: "/learn", external: false },
  { label: "Challenges", href: "/challenges", external: false },
  { label: "Playground", href: "/playground", external: false },
  { label: "Dashboard", href: "/dashboard", external: false },
  { label: "Docs", href: SITE.docsUrl, external: true },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-app/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link href="/" aria-label="GitDojo home">
            <Logo />
          </Link>
          <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
            {NAV_ITEMS.map((item) =>
              item.external ? (
                <a
                  key={item.label}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-small text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
                >
                  {item.label}
                </a>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-small text-fg-secondary transition-colors hover:bg-hover hover:text-fg"
                >
                  {item.label}
                </Link>
              ),
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="secondary" size="sm">
            <a href={SITE.githubUrl} aria-label="Star GitDojo on GitHub">
              <GitHubIcon />
              <span className="hidden lg:inline">Star on GitHub</span>
            </a>
          </Button>
          <AccountControls />
          <MobileNav items={NAV_ITEMS} />
        </div>
      </div>
    </header>
  );
}
