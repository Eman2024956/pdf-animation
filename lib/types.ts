export type SceneKind =
  | "title"
  | "concept"
  | "definition"
  | "formula"
  | "example"
  | "steps"
  | "summary";

/**
 * One animated learning scene. `narration` is a list of beats: the narrator
 * speaks one beat at a time and scene visuals reveal in step with them.
 *
 * Beat layout per kind:
 *  - title:      [intro, overview]            keywords appear on beat 1
 *  - concept:    one beat per bullet           bullet i appears on beat i
 *  - definition: [term intro, definition]      definition unfolds on beat 1
 *  - formula:    [intro, explanation]          caption appears on beat 1
 *  - example:    [intro, ...bullets]           bullet i appears on beat i+1
 *  - steps:      [intro, ...steps]             step i appears on beat i+1
 *  - summary:    [intro, ...bullets]           bullet i appears on beat i+1
 */
export interface Scene {
  id: string;
  kind: SceneKind;
  title: string;
  /** Section label shown above the title. */
  eyebrow?: string;
  /** 1-based source page in the PDF. */
  page: number;
  narration: string[];
  bullets?: string[];
  term?: string;
  definition?: string;
  formula?: string;
  /** True when `formula` is a command or code line rather than maths. */
  code?: boolean;
  caption?: string;
  steps?: string[];
  keywords: string[];
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  startPage: number;
  endPage: number;
  scenes: Scene[];
  keywords: string[];
  /** Trimmed source text, kept so the chapter can be re-written by AI on demand. */
  text: string;
  enhanced?: boolean;
}

export interface LessonStats {
  scenes: number;
  concepts: number;
  definitions: number;
  formulas: number;
  commands: number;
  examples: number;
}

export interface Lesson {
  title: string;
  fileName: string;
  pageCount: number;
  lang: "en" | "ar";
  chapters: Chapter[];
  stats: LessonStats;
}

/** A single line of text recovered from the PDF, with layout hints. */
export interface PdfLine {
  text: string;
  size: number;
  page: number;
}

export interface ExtractedPdf {
  fileName: string;
  title?: string;
  pageCount: number;
  lines: PdfLine[];
  outline: { title: string; page: number }[];
}

export interface Progress {
  stage: "reading" | "structuring" | "building";
  done: number;
  total: number;
}
