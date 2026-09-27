import { Button } from "@gitdojo/ui";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { HeroDemo } from "@/components/landing/hero-demo";
import {
  HowItWorks,
  OpenSourceSection,
  SafetySection,
  VisualizeSection,
} from "@/components/landing/sections";
import { Logo } from "@/components/site/logo";
import { SiteHeader } from "@/components/site/site-header";
import { SITE } from "@/lib/site";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <section className="relative overflow-hidden">
          {/* Subtle radial glow behind the hero. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 -top-40 h-[560px] bg-[radial-gradient(ellipse_at_center,rgb(108_140_255/0.14),transparent_65%)]"
          />
          <div className="relative mx-auto grid max-w-[1280px] gap-12 px-4 pt-16 pb-12 sm:px-6 sm:pt-24 lg:grid-cols-[1fr_1.05fr] lg:items-center">
            <div>
              <h1 className="text-[40px] leading-[48px] font-bold tracking-[-0.03em] text-fg sm:text-display">
                Learn Git <span className="text-accent">by doing.</span>
              </h1>
              <p className="mt-5 max-w-xl text-body-lg text-fg-secondary">
                Type real Git commands, visualize what changes, and learn how to recover when things
                go wrong.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild variant="primary" size="hero">
                  <Link href="/learn/demo">
                    Start learning <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="secondary" size="hero">
                  <a href="#how-it-works">How it works</a>
                </Button>
              </div>
              <p className="mt-6 text-small text-fg-muted">
                Open source • Runs safely in your browser
              </p>
            </div>
            <HeroDemo />
          </div>
        </section>
        <HowItWorks />
        <VisualizeSection />
        <SafetySection />
        <OpenSourceSection />
      </main>
      <footer className="border-t border-border-subtle">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-4 py-8 text-small text-fg-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Logo className="opacity-80" />
          <p>
            MIT licensed ·{" "}
            <a className="hover:text-fg" href={SITE.githubUrl}>
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </>
  );
}
