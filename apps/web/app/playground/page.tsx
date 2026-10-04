import { type Metadata } from "next";
import { PlaygroundWorkspace } from "@/features/playground/components/PlaygroundWorkspace";
import { loadPlaygroundScenarios } from "@/lib/content";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "A safe Git sandbox in your browser: no lesson, no objectives. Edit files, run commands and watch the repository change.",
};

export default async function PlaygroundPage() {
  // Validated on the server at build time; the client receives plain data.
  const scenarios = await loadPlaygroundScenarios();
  return <PlaygroundWorkspace scenarios={scenarios} />;
}
