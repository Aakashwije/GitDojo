// The course feature's public API. Other features import only from here ("@/features/course").

export { CourseNavigationDialog } from "./components/CourseNavigationDialog";
export { CourseProgressBar } from "./components/CourseProgressBar";
export { LessonPager } from "./components/LessonPager";
export { LessonTypeBadge } from "./components/LessonTypeBadge";
export {
  courseHref,
  formatLessonNumber,
  lessonHref,
  lessonNeighbors,
  type LessonNeighbors,
} from "./services/course-navigation";
