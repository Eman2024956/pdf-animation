import type { Chapter, Scene } from "@/lib/types";
import { clip } from "./text";

/** Shape returned by /api/enhance for one scene. */
export interface AiScene {
  kind: "concept" | "definition" | "formula" | "example" | "steps" | "summary";
  title: string;
  intro: string;
  points: string[];
  term?: string | null;
  formula?: string | null;
}

/** Converts AI-written scenes into playable scenes, keeping the chapter's intro scene. */
export function applyAiScenes(chapter: Chapter, ai: AiScene[]): Chapter {
  const base = { page: chapter.startPage, keywords: chapter.keywords };
  const scenes: Scene[] = [chapter.scenes[0]];

  ai.forEach((a, i) => {
    const id = `${chapter.id}-ai${i}`;
    const points = a.points.map((p) => clip(p.trim(), 220)).filter(Boolean).slice(0, 5);
    if (!points.length) return;
    const title = clip(a.title || chapter.title, 70);
    switch (a.kind) {
      case "definition":
        scenes.push({ ...base, id, kind: "definition", title, term: a.term || title, definition: points[0], narration: [a.intro, points[0]] });
        break;
      case "formula":
        if (!a.formula) return;
        scenes.push({ ...base, id, kind: "formula", title, formula: a.formula, caption: points[0], narration: [a.intro, points[0]] });
        break;
      case "steps":
        scenes.push({ ...base, id, kind: "steps", title, steps: points, narration: [a.intro, ...points] });
        break;
      case "example":
      case "summary":
        scenes.push({ ...base, id, kind: a.kind, title, bullets: points, narration: [a.intro, ...points] });
        break;
      default:
        scenes.push({ ...base, id, kind: "concept", title, bullets: points.slice(0, 4), narration: points.slice(0, 4) });
    }
  });

  return scenes.length > 1 ? { ...chapter, scenes, enhanced: true } : chapter;
}
