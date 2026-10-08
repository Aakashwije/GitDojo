// The lesson feature's public API. Other features import only from here ("@/features/lesson").

export { LessonCompleteDialog } from "./components/LessonCompleteDialog";
export { LessonPanel } from "./components/LessonPanel";
export {
  contentSections,
  LessonContent,
  type ContentSection,
} from "./components/content/LessonContent";
export { useLessonStore } from "./state/use-lesson-store";
