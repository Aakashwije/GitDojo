import { type CourseOutline } from "@gitdojo/shared-types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lessonNeighbors } from "../services/course-navigation";
import { CourseOutlineList } from "./CourseOutlineList";
import { LessonPager } from "./LessonPager";

const course: CourseOutline = {
  id: "git-basics",
  slug: "git-basics",
  title: "Git Basics",
  description: "Learn Git.",
  difficulty: "beginner",
  lessons: [
    { id: "what-is-git", slug: "what-is-git", title: "What is Git?", type: "concept", number: 1 },
    {
      id: "git-vs-github",
      slug: "git-vs-github",
      title: "Git vs GitHub",
      type: "concept",
      number: 2,
    },
    {
      id: "git-init",
      slug: "git-init",
      title: "Initialize a Repository",
      type: "interactive",
      number: 3,
    },
    {
      id: "git-status",
      slug: "git-status",
      title: "Understanding git status",
      type: "interactive",
      number: 4,
    },
  ],
};

describe("CourseOutlineList", () => {
  it("shows numbers and completed / current / upcoming markers", () => {
    render(
      <CourseOutlineList
        course={course}
        completed={new Set(["what-is-git", "git-vs-github"])}
        currentLessonId="git-init"
        activeLessonId="git-init"
      />,
    );
    const rows = screen.getAllByTestId("course-lesson");
    expect(rows.map((row) => row.dataset.status)).toEqual([
      "completed",
      "completed",
      "current",
      "upcoming",
    ]);
    expect(rows[0]).toHaveTextContent("01What is Git? (completed)");
    expect(rows[2]).toHaveAttribute("aria-current", "page");
    expect(rows[2]).toHaveAttribute("href", "/learn/git-basics/git-init");
  });
});

describe("LessonPager", () => {
  it("links to the previous and next lessons", () => {
    const position = lessonNeighbors(course, "git-init");
    if (!position) throw new Error("lesson not found");
    render(<LessonPager courseSlug="git-basics" position={position} />);
    expect(screen.getByTestId("previous-lesson")).toHaveAttribute(
      "href",
      "/learn/git-basics/git-vs-github",
    );
    expect(screen.getByTestId("next-lesson")).toHaveAttribute(
      "href",
      "/learn/git-basics/git-status",
    );
  });

  it("returns to the course after the last lesson", () => {
    const position = lessonNeighbors(course, "git-status");
    if (!position) throw new Error("lesson not found");
    render(<LessonPager courseSlug="git-basics" position={position} />);
    expect(screen.getByTestId("next-lesson")).toHaveAttribute("href", "/learn/git-basics");
    expect(screen.getByTestId("next-lesson")).toHaveTextContent("Back to course");
  });
});
