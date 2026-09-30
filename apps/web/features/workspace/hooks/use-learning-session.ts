"use client";

import { type CommandExecutionResult } from "@gitdojo/command-parser";
import { type LessonEnvironment } from "@gitdojo/lesson-engine";
import { type LessonDefinition } from "@gitdojo/shared-types";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLessonStore } from "@/features/lesson/state/use-lesson-store";
import { useRepositoryStore } from "@/features/repository/state/use-repository-store";
import { createBrowserLessonEnvironment } from "../services/browser-environment";
import { LearningSession, type SessionSnapshot } from "../services/learning-session";

export type SessionStatus = "loading" | "ready" | "error";

export interface LearningSessionControls {
  status: SessionStatus;
  errorDetails: string | null;
  execute: (input: string) => Promise<CommandExecutionResult>;
  readFile: (path: string) => Promise<string>;
  saveFile: (path: string, content: string) => Promise<void>;
  reset: () => Promise<void>;
  retry: () => void;
}

function publish(snapshot: SessionSnapshot): void {
  useRepositoryStore.getState().setRepositoryState(snapshot.repository);
  useLessonStore.getState().applyEvaluation(snapshot.validation, snapshot.progress);
}

function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

/** Binds a {@link LearningSession} to the view stores. */
export function useLearningSession(
  lesson: LessonDefinition,
  createEnvironment: () => LessonEnvironment = createBrowserLessonEnvironment,
): LearningSessionControls {
  const sessionRef = useRef<LearningSession | null>(null);
  // Server-provided props can be re-created with a new identity on re-render; the effect keys
  // on the lesson id and reads the object through a ref.
  const lessonRef = useRef(lesson);
  const environmentRef = useRef(createEnvironment);
  useEffect(() => {
    lessonRef.current = lesson;
    environmentRef.current = createEnvironment;
  });
  const lessonId = lesson.id;
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Created in an effect because the environment needs IndexedDB, which only exists in browsers.
    if (sessionRef.current?.lessonId !== lessonId) {
      sessionRef.current = new LearningSession(lessonRef.current, environmentRef.current());
    }
    const session = sessionRef.current;
    useRepositoryStore.getState().setWorkspace(session.workspaceId);
    useLessonStore.getState().startLesson();

    session.start().then(
      (snapshot) => {
        if (cancelled) return;
        publish(snapshot);
        setStatus("ready");
      },
      (error: unknown) => {
        if (cancelled) return;
        console.error("[gitdojo] lesson setup failed", error);
        useRepositoryStore.getState().setError("Something went wrong loading this lesson.");
        setErrorDetails(describe(error));
        setStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [lessonId, attempt]);

  const execute = useCallback(async (input: string): Promise<CommandExecutionResult> => {
    const session = sessionRef.current;
    if (!session)
      return { ok: false, output: "The workspace is still loading.", errorCode: "INTERNAL" };
    useLessonStore.getState().recordCommand();
    try {
      const { result, snapshot } = await session.execute(input);
      publish(snapshot);
      return result;
    } catch (error) {
      console.error("[gitdojo] command failed", error);
      return {
        ok: false,
        output: "fatal: GitDojo could not read the repository. Try resetting the lesson.",
        errorCode: "INTERNAL",
      };
    }
  }, []);

  const readFile = useCallback(async (path: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error("The workspace is still loading.");
    return session.readFile(path);
  }, []);

  const saveFile = useCallback(async (path: string, content: string) => {
    const session = sessionRef.current;
    if (!session) throw new Error("The workspace is still loading.");
    useLessonStore.getState().recordCommand();
    publish(await session.writeFile(path, content));
  }, []);

  const reset = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    useLessonStore.getState().resetAttempt();
    useRepositoryStore.getState().selectCommit(null);
    publish(await session.reset());
  }, []);

  const retry = useCallback(() => {
    // A failed start is memoized by the session, so retrying needs a fresh one.
    sessionRef.current = null;
    setStatus("loading");
    setErrorDetails(null);
    setAttempt((value) => value + 1);
  }, []);

  return { status, errorDetails, execute, readFile, saveFile, reset, retry };
}
