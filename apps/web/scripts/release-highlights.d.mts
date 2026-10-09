export declare const HIGHLIGHTS_HEADING: string;

export declare const HIGHLIGHT_LIMITS: {
  min: number;
  max: number;
  highlightLength: number;
  introLength: number;
};

export declare class ReleaseNotesError extends Error {
  readonly problems: string[];
  constructor(problems: string[]);
}

export declare function parseLearnerHighlights(body: string): {
  intro: string | null;
  highlights: string[];
};
