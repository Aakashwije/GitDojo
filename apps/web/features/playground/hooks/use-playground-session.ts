"use client";

import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { type PlaygroundScenario } from "@gitdojo/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type WorkspaceFileActions } from "@/features/editor/services/editor-controller";
import { useEditorStore } from "@/features/editor/state/use-editor-store";
import { explainOutcome } from "@/features/errors/services/explain-outcome";
import { useExplanationStore } from "@/features/errors/state/use-explanation-store";
import { useRepositoryStore } from "@/features/repository/state/use-repository-store";
import { createBrowserLessonEnvironment } from "@/features/workspace/services/browser-environment";
import {
  NEW_REPOSITORY_SETUP,
  PlaygroundSession,
  type PlaygroundExport,
  type PlaygroundSnapshot,
} from "../services/playground-session";
import { hydratePlaygroundStore, usePlaygroundStore } from "../state/use-playground-store";

export type PlaygroundStatus = "loading" | "ready" | "error";

export interface PlaygroundControls {
  status: PlaygroundStatus;
  errorDetails: string | null;
  /** True when the repository was restored from a previous visit. */
  restored: boolean;
  execute: (input: string) => Promise<CommandExecutionResult>;
  files: WorkspaceFileActions;
  loadScenario: (scenario: PlaygroundScenario) => Promise<void>;
  newRepository: () => Promise<void>;
  /** Rebuilds the scenario the repository came from (or a blank repository). */
  reset: () => Promise<void>;
  exportSnapshot: () => Promise<PlaygroundExport>;
  retry: () => void;
}

/** The playground's default the very first time: something to look at straight away. */
export const DEFAULT_SCENARIO = "simple";

function publish(snapshot: PlaygroundSnapshot): void {
  useRepositoryStore.getState().setRepositoryState(snapshot.repository);
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function requireSession(session: PlaygroundSession | null): PlaygroundSession {
  if (!session) throw new Error("The playground is still loading.");
  return session;
}

/** Binds a {@link PlaygroundSession} to the view stores. */
export function usePlaygroundSession(
  scenarios: readonly PlaygroundScenario[],
  createEnvironment: () => LessonEnvironment = createBrowserLessonEnvironment,
): PlaygroundControls {
  const sessionRef = useRef<PlaygroundSession | null>(null);
  const scenariosRef = useRef(scenarios);
  const environmentRef = useRef(createEnvironment);
  useEffect(() => {
    scenariosRef.current = scenarios;
    environmentRef.current = createEnvironment;
  });
  const [status, setStatus] = useState<PlaygroundStatus>("loading");
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // An object, not a boolean, so TypeScript does not narrow it across the `await`s below.
    const lifecycle = { cancelled: false };
    // Created in an effect because the environment needs IndexedDB, which only exists in browsers.
    sessionRef.current ??= new PlaygroundSession(environmentRef.current());
    const session = sessionRef.current;
    useRepositoryStore.getState().setWorkspace(session.workspaceId);
    useEditorStore.getState().reset();
    useExplanationStore.getState().dismiss();

    void (async () => {
      try {
        await hydratePlaygroundStore();
        const fallback = scenariosRef.current.find((s) => s.id === DEFAULT_SCENARIO);
        const snapshot = await session.start(
          fallback?.setup ?? NEW_REPOSITORY_SETUP,
          fallback?.id ?? "new-repository",
        );
        if (lifecycle.cancelled) return;
        if (!snapshot.restored) usePlaygroundStore.getState().setScenario(fallback?.id ?? null);
        publish(snapshot);
        setRestored(snapshot.restored);
        setStatus("ready");
      } catch (error) {
        if (lifecycle.cancelled) return;
        console.error("[gitdojo] playground setup failed", error);
        useRepositoryStore.getState().setError("Something went wrong loading the playground.");
        setErrorDetails(describe(error));
        setStatus("error");
      }
    })();
    return () => {
      lifecycle.cancelled = true;
    };
  }, [attempt]);

  const execute = useCallback(async (input: string): Promise<CommandExecutionResult> => {
    const session = sessionRef.current;
    if (!session) {
      return { ok: false, output: "The playground is still loading.", errorCode: "INTERNAL" };
    }
    try {
      const { result, snapshot } = await session.execute(input);
      publish(snapshot);
      explainOutcome(input, result, snapshot.repository);
      return result;
    } catch (error) {
      console.error("[gitdojo] command failed", error);
      return {
        ok: false,
        output: "fatal: GitDojo could not read the repository. Try resetting the playground.",
        errorCode: "INTERNAL",
      };
    }
  }, []);

  const files = useMemo<WorkspaceFileActions>(
    () => ({
      readFile: (path) => requireSession(sessionRef.current).readFile(path),
      saveFile: async (path, content) => {
        publish(await requireSession(sessionRef.current).writeFile(path, content));
      },
      createFile: async (path) => {
        publish(await requireSession(sessionRef.current).createFile(path));
      },
      deleteFile: async (path) => {
        publish(await requireSession(sessionRef.current).deleteFile(path));
      },
    }),
    [],
  );

  const replace = useCallback(
    async (build: (session: PlaygroundSession) => Promise<PlaygroundSnapshot>) => {
      const session = requireSession(sessionRef.current);
      useEditorStore.getState().reset();
      useRepositoryStore.getState().selectCommit(null);
      publish(await build(session));
      setRestored(false);
    },
    [],
  );

  const loadScenario = useCallback(
    async (scenario: PlaygroundScenario) => {
      await replace((session) => session.loadScenario(scenario));
      usePlaygroundStore.getState().setScenario(scenario.id);
    },
    [replace],
  );

  const newRepository = useCallback(async () => {
    await replace((session) => session.load(NEW_REPOSITORY_SETUP, "new-repository"));
    usePlaygroundStore.getState().setScenario(null);
  }, [replace]);

  const reset = useCallback(async () => {
    const id = usePlaygroundStore.getState().scenarioId;
    const scenario = scenariosRef.current.find((candidate) => candidate.id === id);
    await replace((session) =>
      scenario
        ? session.loadScenario(scenario)
        : session.load(NEW_REPOSITORY_SETUP, "new-repository"),
    );
  }, [replace]);

  const exportSnapshot = useCallback(
    () =>
      requireSession(sessionRef.current).exportSnapshot(usePlaygroundStore.getState().scenarioId),
    [],
  );

  const retry = useCallback(() => {
    sessionRef.current = null;
    setStatus("loading");
    setErrorDetails(null);
    setAttempt((value) => value + 1);
  }, []);

  return {
    status,
    errorDetails,
    restored,
    execute,
    files,
    loadScenario,
    newRepository,
    reset,
    exportSnapshot,
    retry,
  };
}
