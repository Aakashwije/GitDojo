import { Badge, Button } from "@gitdojo/ui";
import {
  BookOpen,
  Eye,
  GitBranch,
  GitCommitHorizontal,
  Layers,
  ShieldCheck,
  SquareTerminal,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";
import { GitHubIcon } from "@/components/site/github-icon";
import { SITE } from "@/lib/site";

const STEPS = [
  {
    icon: BookOpen,
    title: "Learn",
    body: "Short, focused lessons explain one Git idea at a time.",
  },
  {
    icon: SquareTerminal,
    title: "Type",
    body: "Run real Git commands in a terminal that lives in your browser.",
  },
  {
    icon: Eye,
    title: "Visualize",
    body: "Watch files move between the working tree, staging area and history.",
  },
  {
    icon: Wrench,
    title: "Fix",
    body: "Make mistakes on purpose, then learn how to recover from them.",
  },
];

const CONCEPTS = [
  { icon: Layers, label: "Working tree" },
  { icon: Layers, label: "Staging area" },
  { icon: GitCommitHorizontal, label: "Commits" },
  { icon: GitBranch, label: "Branches" },
  { icon: GitBranch, label: "HEAD" },
];

function Section({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6 sm:py-24">
      {children}
    </section>
  );
}

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <h2 className="text-h2 font-[650] text-fg">How GitDojo works</h2>
      <p className="mt-2 max-w-xl text-body-lg text-fg-secondary">
        Stop memorizing Git commands. Start understanding them.
      </p>
      <ol className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body }, index) => (
          <li key={title} className="rounded-lg border border-border bg-panel p-5">
            <div className="flex items-center gap-2 text-fg-muted">
              <Icon className="size-[18px]" aria-hidden="true" />
              <span className="font-mono text-caption">0{index + 1}</span>
            </div>
            <h3 className="mt-3 text-h4 font-semibold text-fg">{title}</h3>
            <p className="mt-1 text-small text-fg-secondary">{body}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}

export function VisualizeSection() {
  return (
    <Section>
      <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
        <div>
          <h2 className="text-h2 font-[650] text-fg">Git makes more sense when you can see it.</h2>
          <p className="mt-3 text-body-lg text-fg-secondary">
            Every command changes the repository. GitDojo shows you how, and makes the invisible
            parts of Git visible.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {CONCEPTS.map(({ icon: Icon, label }) => (
            <li
              key={label}
              className="flex items-center gap-2 rounded-lg border border-border bg-panel px-4 py-3 text-small text-fg"
            >
              <Icon className="size-4 text-accent" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}

export function SafetySection() {
  return (
    <Section>
      <div className="rounded-xl border border-border bg-surface p-8 sm:p-12">
        <Badge tone="branch">Coming soon</Badge>
        <h2 className="mt-4 text-h2 font-[650] text-fg">Break things safely.</h2>
        <p className="mt-3 max-w-2xl text-body-lg text-fg-secondary">
          Merge the wrong branch. Lose a commit. Enter detached HEAD. Create a conflict. Then learn
          how to recover. Everything runs in a sandboxed repository inside your browser, so there is
          nothing to install and nothing to break.
        </p>
        <p className="mt-6 flex items-center gap-2 text-small text-fg-muted">
          <ShieldCheck className="size-4 text-success" aria-hidden="true" />
          Break Git here, not in production.
        </p>
      </div>
    </Section>
  );
}

export function OpenSourceSection() {
  return (
    <Section>
      <div className="flex flex-col items-start justify-between gap-6 border-t border-border-subtle pt-16 lg:flex-row lg:items-center">
        <div>
          <h2 className="text-h2 font-[650] text-fg">Built in the open.</h2>
          <p className="mt-3 max-w-xl text-body-lg text-fg-secondary">
            Contribute lessons, challenges, features, docs and fixes. Lessons are plain YAML files,
            so writing one takes minutes.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="primary" size="lg">
            <Link href="/learn/demo">Start learning</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <a href={SITE.githubUrl}>
              <GitHubIcon /> View on GitHub
            </a>
          </Button>
        </div>
      </div>
    </Section>
  );
}
