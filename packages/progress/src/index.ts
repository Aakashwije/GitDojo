export { applyProgressAction, type ProgressAction } from "./actions";
export {
  indexLessons,
  type CatalogLesson,
  type ChallengeInfo,
  type ProgressCatalog,
  type StandaloneLessonInfo,
} from "./catalog";
export {
  EXPORT_FORMAT,
  EXPORT_VERSION,
  exportFileName,
  exportProgress,
  type ProgressExport,
} from "./export";
export {
  LEGACY_MIGRATION,
  LEGACY_STORAGE_KEY,
  migrateLegacyProgress,
  parseLegacyProgress,
  type LegacyProgress,
  type LegacyStorage,
} from "./migration";
export {
  ANONYMOUS,
  completionXp,
  contentKey,
  emptyProgress,
  ownerKey,
  PROGRESS_SCHEMA_VERSION,
  totalXp,
  XP_REWARDS,
  type CommandStat,
  type CompletionRecord,
  type ContentRef,
  type LocalProgress,
  type ProgressOwner,
} from "./model";
export { NewerProgressVersionError, parseProgress, type ParsedProgress } from "./parse";
export {
  PROGRESS_CHANNEL,
  ProgressRepository,
  type LoadedProgress,
  type Persistence,
  type ProgressChannel,
  type ProgressRepositoryOptions,
} from "./repository";
export {
  commandSummary,
  completedChallengeIds,
  completedLessonIds,
  continueLearning,
  courseProgress,
  hintsUsed,
  nextLessonToStudy,
  recentActivity,
  totalHintsUsed,
  type ActivityItem,
  type CommandSummary,
  type CommandUsage,
  type ContinueTarget,
  type CourseProgress,
} from "./selectors";
export {
  createIndexedDbStorage,
  createMemoryStorage,
  PROGRESS_DATABASE,
  type ProgressStorage,
} from "./storage";
