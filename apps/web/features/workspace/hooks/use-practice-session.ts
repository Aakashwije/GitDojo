"use client";

import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type WorkspaceFileActions } from "@/features/editor";
import { explainOutcome, useExplanationStore } from "@/features/errors";
import { recordCommand } from "@/features/progress";
import { useRepositoryStore } from "@/features/repository";
import { createBrowserLessonEnvironment } from "../services/browser-environment";
import { settleEditor } from "../services/git-editor";
import { PracticeSession, type PracticeSnapshot } from "../services/practice-session";
import { useGitEditorStore } from "../state/use-git-editor-store";
import { type SessionStatus } from "./use-learning-session";

export interface PracticeSessionControls {
  status: SessionStatus;
  errorDetails: string | null;
  /** The latest evaluation, or `null` while loading. */
  snapshot: PracticeSnapshot | null;
  execute: (input: string) => Promise<CommandExecutionResult>;
  files: WorkspaceFileActions;
  reset: () => Promise<void>;
  retry: () => void;
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Binds a {@link PracticeSession} to the repository store and local state. */
export function usePracticeSession(
  task: LessonDefinition,
  {
    createEnvironment = createBrowserLessonEnvironment,
  }: { createEnvironment?: () => LessonEnvironment } = {},
): PracticeSessionControls {
  const sessionRef = useRef<PracticeSession | null>(null);
  const taskRef = useRef(task);
  const environmentRef = useRef(createEnvironment);
  useEffect(() => {
    taskRef.current = task;
    environmentRef.current = createEnvironment;
  });
  const taskId = task.id;
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<PracticeSnapshot | null>(null);
  const [attempt, setAttempt] = useState(0);

  const publish = useCallback((next: PracticeSnapshot) => {
    useRepositoryStore.getState().setRepositoryState(next.repository);
    setSnapshot(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (sessionRef.current?.taskId !== taskId) {
      sessionRef.current = new PracticeSession(taskRef.current, environmentRef.current());
    }
    const session = sessionRef.current;
    useRepositoryStore.getState().setWorkspace(session.workspaceId);
    useExplanationStore.getState().dismiss();
    session.start().then(
      (started) => {
        if (cancelled) return;
        publish(started);
        setStatus("ready");
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error("[gitdojo] practice setup failed", error);
        useRepositoryStore.getState().setError("Something went wrong loading this task.");
        setErrorDetails(describe(error));
        setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [taskId, attempt, publish]);

  const execute = useCallback(
    async (input: string): Promise<CommandExecutionResult> => {
      const session = sessionRef.current;
      if (!session) {
        return { ok: false, output: "The workspace is still loading.", errorCode: "INTERNAL" };
      }
      try {
        const started = await session.execute(input);
        publish(started.snapshot);
        recordCommand(started.result);
        const { result, snapshot: settled } = await settleEditor(
          session,
          started,
          (state) => state.repository,
          (editor) => useGitEditorStore.getState().open(editor),
          publish,
        );
        explainOutcome(input, result, settled.repository);
        return result;
      } catch (error) {
        console.error("[gitdojo] command failed", error);
        return {
          ok: false,
          output: "fatal: GitDojo could not read the repository. Try resetting the task.",
          errorCode: "INTERNAL",
        };
      }
    },
    [publish],
  );

  const files = useMemo<WorkspaceFileActions>(() => {
    const require = () => {
      const session = sessionRef.current;
      if (!session) throw new Error("The workspace is still loading.");
      return session;
    };
    return {
      readFile: (path) => require().readFile(path),
      saveFile: async (path, content) => {
        publish(await require().writeFile(path, content));
      },
      createFile: async (path) => {
        publish(await require().createFile(path));
      },
      deleteFile: async (path) => {
        publish(await require().deleteFile(path));
      },
    };
  }, [publish]);

  const reset = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    useRepositoryStore.getState().selectCommit(null);
    useExplanationStore.getState().dismiss();
    publish(await session.reset());
  }, [publish]);

  const retry = useCallback(() => {
    sessionRef.current = null;
    setStatus("loading");
    setErrorDetails(null);
    setAttempt((value) => value + 1);
  }, []);

  return { status, errorDetails, snapshot, execute, files, reset, retry };
}
