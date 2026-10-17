export { applyProgressAction, type ProgressAction } from "./actions";
export {
  indexLessons,
  type CatalogLesson,
  type ChallengeInfo,
  type PracticeInfo,
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
  COMPLETION_FIELDS,
  completionXp,
  contentKey,
  emptyProgress,
  isReleaseVersion,
  ownerKey,
  PROGRESS_SCHEMA_VERSION,
  RELEASE_VERSION,
  totalXp,
  withRemoteCounters,
  XP_REWARDS,
  type CommandStat,
  type CompletionRecord,
  type ContentRef,
  type LocalProgress,
  type ProgressOwner,
  type RemoteCounters,
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
  solvedPracticeIds,
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
export {
  isSkillId,
  MASTERY_RULE,
  normalizeConcept,
  skillForConcept,
  skillProgress,
  SKILLS,
  skillsForConcepts,
  type SkillDefinition,
  type SkillProgress,
  type SkillStatus,
} from "./skills";
export {
  recommendNextSteps,
  skillNextActions,
  type Recommendation,
  type SkillAction,
} from "./recommendations";
export { dailyActivity, type ActivityDay, type DailyActivity } from "./activity";
export {
  learningJourney,
  type JourneyMilestone,
  type LearningJourney,
  type MilestoneStatus,
} from "./journey";
export { pickSurpriseTask, type SurpriseCandidate, type SurpriseOptions } from "./practice";
export {
  buildProgressReport,
  DEFAULT_LEARNER_NAME,
  MAX_LEARNER_NAME_LENGTH,
  normalizeLearnerName,
  type ProgressReport,
  type ReportActivity,
  type ReportCourse,
  type ReportNextStep,
  type ReportOptions,
  type ReportSkill,
  type ReportStat,
} from "./report";
