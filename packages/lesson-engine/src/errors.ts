export class InvalidLessonError extends Error {
  constructor(
    readonly origin: string,
    readonly issues: string[],
  ) {
    super(`Invalid lesson "${origin}":\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "InvalidLessonError";
  }
}

export class LessonNotFoundError extends Error {
  constructor(readonly slug: string) {
    super(`Lesson "${slug}" was not found`);
    this.name = "LessonNotFoundError";
  }
}

export class LessonSetupError extends Error {
  constructor(
    readonly lessonId: string,
    message: string,
  ) {
    super(`Could not set up lesson "${lessonId}": ${message}`);
    this.name = "LessonSetupError";
  }
}

export class InvalidCourseError extends Error {
  constructor(
    readonly origin: string,
    readonly issues: string[],
  ) {
    super(`Invalid course "${origin}":\n${issues.map((issue) => `  - ${issue}`).join("\n")}`);
    this.name = "InvalidCourseError";
  }
}

export class CourseNotFoundError extends Error {
  constructor(readonly slug: string) {
    super(`Course "${slug}" was not found`);
    this.name = "CourseNotFoundError";
  }
}
