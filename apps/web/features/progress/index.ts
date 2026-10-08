// The progress feature's public API. Other features import only from here ("@/features/progress").

export { ProgressManagement } from "./components/ProgressManagement";
export { XpAward } from "./components/XpAward";
export { useLessonProgress } from "./hooks/use-lesson-progress";
export { recordCommand } from "./services/record-command";
export {
  initProgress,
  recordCompletion,
  recordProgress,
  resetProgressStoreForTests,
  useCompletedChallenges,
  useCompletedLessons,
  useProgressStore,
} from "./state/use-progress-store";
