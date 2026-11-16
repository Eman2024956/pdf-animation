import type { Chapter, ExtractedPdf, Lesson, PdfLine, Progress, Scene } from "@/lib/types";
import { clip, detectLang, speakFormula, splitSentences, titleCase, tokenize, topKeywords } from "./text";

/* ------------------------------------------------------------------ */
/* Narrator phrases                                                    */
/* ------------------------------------------------------------------ */

const joinList = (items: string[], and: string) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} ${and} ${items[items.length - 1]}`;

const PHRASES = {
  en: {
    intro: (t: string) => `Let's explore ${t}.`,
    overview: (k: string[]) => `In this part, we'll look at ${joinList(k, "and")}.`,
    defIntro: (t: string) => `Here's a key term to remember: ${t}.`,
    formulaIntro: (f: string) => `Here is an important formula. ${f}.`,
    codeIntro: (c: string) => (c ? `${c.replace(/[.:]+$/, "")}. Here is the command.` : "Here is the command to use."),
    exampleIntro: "Let's look at an example.",
    stepsIntro: "Let's go through this step by step.",
    recap: (t: string) => `Let's recap what we learned about ${t}.`,
    part: "Part",
    introduction: "Introduction",
  },
  ar: {
    intro: (t: string) => `لنتعرّف على ${t}.`,
    overview: (k: string[]) => `في هذا الجزء سنتناول ${joinList(k, "و")}.`,
    defIntro: (t: string) => `إليك مصطلحاً مهماً: ${t}.`,
    formulaIntro: (f: string) => `هذه معادلة مهمة. ${f}.`,
    codeIntro: (c: string) => (c ? `${c.replace(/[.:]+$/, "")}. هذا هو الأمر.` : "هذا هو الأمر المستخدم."),
    exampleIntro: "لنأخذ مثالاً.",
    stepsIntro: "لنتابع الخطوات واحدة تلو الأخرى.",
    recap: (t: string) => `لنراجع ما تعلمناه عن ${t}.`,
    part: "الجزء",
    introduction: "مقدمة",
  },
};
type Phrases = (typeof PHRASES)["en"];

/* ------------------------------------------------------------------ */
/* Structure: lines -> sections -> chapters                            */
/* ------------------------------------------------------------------ */

interface Section {
  title: string;
  level: 1 | 2;
  page: number;
  lines: PdfLine[];
}
interface RawChapter {
  title: string;
  page: number;
  sections: Section[];
}

const CHAPTER_WORD = /^(chapter|unit|lesson|part|module|section|الفصل|الوحدة|الباب|الدرس)\s+[\p{L}\d]+\s*[:.–-]?\s*/iu;
const NUMBERED_HEADING = /^\d{1,2}(\.\d{1,2}){0,2}\.?\s+\p{L}[^.!?]{2,70}$/u;

function cleanLines(ex: ExtractedPdf): PdfLine[] {
  // Running headers/footers repeat on many pages; drop them along with page numbers and TOC rows.
  const pagesByKey = new Map<string, Set<number>>();
  const keyOf = (t: string) => t.replace(/\d+/g, "#").toLowerCase();
  for (const l of ex.lines) {
    if (l.text.length > 80) continue;
    const k = keyOf(l.text);
    if (!pagesByKey.has(k)) pagesByKey.set(k, new Set());
    pagesByKey.get(k)!.add(l.page);
  }
  const repeatLimit = Math.max(3, ex.pageCount * 0.3);
  return ex.lines.filter((l) => {
    const t = l.text;
    if (/^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(t)) return false;
    if (/(\.\s?){4,}\s*\d+$/.test(t)) return false;
    if (t.length <= 80 && (pagesByKey.get(keyOf(t))?.size ?? 0) > repeatLimit) return false;
    return true;
  });
}

function bodySize(lines: PdfLine[]): number {
  const weight = new Map<number, number>();
  for (const l of lines) weight.set(l.size, (weight.get(l.size) ?? 0) + l.text.length);
  let best = 10;
  let max = 0;
  for (const [s, w] of weight) if (w > max) [best, max] = [s, w];
  return best;
}

function headingLevel(l: PdfLine, body: number): 0 | 1 | 2 {
  const t = l.text;
  if (t.length < 3 || t.length > 90 || !/\p{L}/u.test(t)) return 0;
  if (t.split(/\s+/).length > 14 || /[.,;!?]$/.test(t)) return 0;
  const chapterWord = CHAPTER_WORD.test(t) && t.length < 70 && l.size >= body;
  if (chapterWord || l.size >= body * 1.5) return 1;
  if (l.size >= body * 1.15) return 2;
  if (NUMBERED_HEADING.test(t) && l.size >= body && !/[=;{}]/.test(t)) return 2;
  return 0;
}

function toSections(lines: PdfLine[], body: number, P: Phrases): Section[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  let prevHeading: PdfLine | null = null;

  for (const l of lines) {
    const level = headingLevel(l, body);
    if (level) {
      if (cur && prevHeading && cur.lines.length === 0 && prevHeading.page === l.page) {
        // "Chapter 3" + "Forces", or one title wrapped across lines.
        const bare = /^(chapter|unit|lesson|part|module|الفصل|الوحدة)\s+[\p{L}\d]+$/iu.test(cur.title);
        if (bare || (prevHeading.size === l.size && cur.title.length + l.text.length < 100)) {
          cur.title = bare ? `${cur.title}: ${l.text}` : `${cur.title} ${l.text}`;
          if (level === 1) cur.level = 1;
          prevHeading = l;
          continue;
        }
      }
      cur = { title: l.text, level, page: l.page, lines: [] };
      sections.push(cur);
      prevHeading = l;
    } else {
      if (!cur) {
        cur = { title: P.introduction, level: 2, page: l.page, lines: [] };
        sections.push(cur);
      }
      cur.lines.push(l);
      prevHeading = null;
    }
  }
  return sections;
}

/** Similarity of two titles by the letters they contain, tolerant of extraction glitches in letter order. */
function bagSimilarity(a: string, b: string): number {
  const bag = (t: string) => [...t.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")].sort();
  const x = bag(a);
  const y = bag(b);
  if (!x.length || !y.length) return 0;
  let i = 0;
  let j = 0;
  let same = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) {
      same++;
      i++;
      j++;
    } else if (x[i] < y[j]) i++;
    else j++;
  }
  return (2 * same) / (x.length + y.length);
}

const sectionChars = (s: Section) => s.lines.reduce((n, l) => n + l.text.length, 0);

function toChapters(ex: ExtractedPdf, lines: PdfLine[], sections: Section[], lessonTitle: string, P: Phrases): RawChapter[] {
  const headed = sections.filter((s) => s.title !== P.introduction);
  let chapters: RawChapter[] = [];

  // Bookmarks give the cleanest chapter titles. Pair each one with the heading it points at.
  const starts = new Map<Section, string>();
  for (const o of ex.outline) {
    let best: Section | null = null;
    let bestSim = 0.7;
    for (const sec of headed) {
      if (starts.has(sec) || Math.abs(sec.page - o.page) > 1) continue;
      const sim = bagSimilarity(o.title, sec.title);
      if (sim > bestSim) [best, bestSim] = [sec, sim];
    }
    if (best) starts.set(best, o.title);
  }

  if (ex.outline.length >= 2 && starts.size >= ex.outline.length * 0.5) {
    for (const s of sections) {
      const title = starts.get(s);
      if (title || !chapters.length) chapters.push({ title: title ?? lessonTitle, page: s.page, sections: [] });
      if (title) s.title = title;
      chapters[chapters.length - 1].sections.push(s);
    }
  } else if (ex.outline.length >= 2) {
    chapters = ex.outline.map((o) => ({ title: o.title, page: o.page, sections: [] }));
    const front: RawChapter = { title: lessonTitle, page: 1, sections: [] };
    for (const s of sections) {
      let target = front;
      for (const c of chapters) if (c.page <= s.page) target = c;
      target.sections.push(s);
    }
    if (front.sections.length) chapters.unshift(front);
  } else if (headed.length >= 2) {
    const useLevels = headed.filter((s) => s.level === 1).length >= 2;
    for (const s of sections) {
      const startsChapter = useLevels ? s.level === 1 : s.title !== P.introduction;
      if (startsChapter || !chapters.length) {
        chapters.push({ title: startsChapter ? s.title : lessonTitle, page: s.page, sections: [] });
      }
      chapters[chapters.length - 1].sections.push(s);
    }
  } else {
    // No usable headings: fall back to even page chunks.
    const per = Math.min(8, Math.max(1, Math.ceil(ex.pageCount / 10)));
    for (let start = 1; start <= ex.pageCount; start += per) {
      const end = Math.min(ex.pageCount, start + per - 1);
      const chunk = lines.filter((l) => l.page >= start && l.page <= end);
      const n = chapters.length + 1;
      const title = ex.pageCount <= per ? lessonTitle : `${P.part} ${n}`;
      chapters.push({ title, page: start, sections: [{ title, level: 1, page: start, lines: chunk }] });
    }
  }
  return chapters.filter((c) => c.sections.reduce((n, s) => n + sectionChars(s), 0) >= 30);
}

/* ------------------------------------------------------------------ */
/* Concept detection                                                   */
/* ------------------------------------------------------------------ */

type Unit =
  | { type: "sent"; text: string; page: number }
  | { type: "formula"; text: string; page: number; code?: boolean }
  | { type: "list"; items: string[]; ordered: boolean; page: number };

const LIST_ITEM = /^(?:((?:step\s*)?\d{1,2}[.):]|step\s*\d{1,2})|[•●▪■◦○–*-])\s+(.{6,})$/iu;

function isFormula(t: string): boolean {
  if (t.length > 64 || /https?:|www\.|[{};]|==|=>|\$\s/.test(t)) return false;
  if (!/\S\s*[=≈→⇌∝≤≥]\s*\S/.test(t)) return false;
  if ((t.match(/\p{L}{7,}/gu) ?? []).length > 1) return false;
  return !/[,;:!?]$/.test(t);
}

const CLI = /^(\$\s|>\s|(npm|npx|yarn|pnpm|bun|git|wrangler|curl|wget|pip3?|python3?|docker|kubectl|cd|ls|mkdir|sudo|brew|apt(-get)?|node|deno|cargo|go|make|ssh|vercel|gh|terraform|aws|gcloud|az|flutter|dart|firebase|composer|php|ruby|gem|java|mvn|gradle|dotnet|psql|mysql|redis-cli|export|echo|cat|chmod|cp|mv|rm|touch|code)\s+\S)/;

/** A shell command or line of code: plain ASCII that starts like a CLI call or carries flags. */
function isCode(t: string): boolean {
  if (t.length > 110 || t.length < 4 || /[^\x20-\x7E]/.test(t)) return false;
  if (/[.!?]$/.test(t) && !/\s--?\w/.test(t)) return false;
  return CLI.test(t) || (/\s--?[a-z][\w-]*/.test(t) && t.split(/\s+/).length <= 10 && /^[a-z]/.test(t));
}

function toUnits(lines: PdfLine[]): Unit[] {
  const units: Unit[] = [];
  let buf = "";
  let bufPage = 0;
  let openList: Extract<Unit, { type: "list" }> | null = null;

  const flush = () => {
    for (const s of splitSentences(buf)) units.push({ type: "sent", text: s, page: bufPage });
    buf = "";
  };

  for (const l of lines) {
    const t = l.text;
    const li = t.match(LIST_ITEM);
    if (isCode(t)) {
      flush();
      openList = null;
      units.push({ type: "formula", text: t.replace(/^\$\s+/, ""), page: l.page, code: true });
    } else if (isFormula(t)) {
      flush();
      openList = null;
      units.push({ type: "formula", text: t.replace(/\.$/, ""), page: l.page });
    } else if (li) {
      flush();
      const ordered = Boolean(li[1]);
      if (!openList || openList.ordered !== ordered) {
        openList = { type: "list", items: [], ordered, page: l.page };
        units.push(openList);
      }
      openList.items.push(li[2].trim());
    } else if (openList && openList.items.length) {
      const last = openList.items[openList.items.length - 1];
      if (!/[.!?:]$/.test(last) && last.length < 220) {
        openList.items[openList.items.length - 1] = `${last} ${t}`;
      } else {
        openList = null;
        buf = t;
        bufPage = l.page;
      }
    } else {
      if (!buf) bufPage = l.page;
      buf = /\p{L}-$/u.test(buf) ? buf.slice(0, -1) + t : buf ? `${buf} ${t}` : t;
    }
  }
  flush();

  // A "list" of one is just a sentence.
  return units.map((u) =>
    u.type === "list" && u.items.length < 2
      ? ({ type: "sent", text: u.items[0] ?? "", page: u.page } as Unit)
      : u,
  );
}

const NOT_A_TERM = /^(it|this|that|these|those|there|here|he|she|they|we|you|i|what|which|who|one|each|some|many|most|all|if|when|as|in|on|for|however|thus|so|but|and|or|then|such|both|another|other|every|now|today|their|its|our|his|her)\b/i;

function parseDefinition(s: string): { term: string; definition: string } | null {
  if (s.length < 40 || s.length > 320) return null;
  const strong = s.match(
    /^(?:(?:An?|The)\s+)?(.{2,48}?)\s+(is defined as|are defined as|is called|is known as|refers to|refer to|is the process (?:of|by which)|is the study of|means|يُعرّف بأنه|يعرف بأنه|هو عبارة عن|هي عبارة عن)\s+(.{15,})$/iu,
  );
  const weak = strong
    ? null
    : s.match(/^(?:(?:An?|The)\s+)?(.{2,48}?)\s+(is|are)\s+((?:a|an|the|any|one of|when|where|how)\s+.{15,})$/iu);
  const m = strong ?? weak;
  if (!m) return null;
  const term = m[1].trim();
  if (NOT_A_TERM.test(term) || term.split(/\s+/).length > 5 || /[,;:()]/.test(term)) return null;
  if (weak && !/^\p{Lu}/u.test(s)) return null;
  return { term: titleCase(term), definition: titleCase(m[3].trim()) };
}

const EXAMPLE = /^(for example|for instance|e\.g\.|example\s*\d*\s*[:.]|consider\s|suppose\s|imagine\s|على سبيل المثال|مثال|مثلاً|مثلا)/iu;
const CUES = /\b(important|key|main|essential|therefore|because|fundamental|primary|result(s)? in|leads? to|causes?|allows?|in other words|remember|note that|must|always|never)\b/i;

/* ------------------------------------------------------------------ */
/* Scenes                                                              */
/* ------------------------------------------------------------------ */

interface Scored {
  text: string;
  page: number;
  score: number;
  order: number;
}

function scoreSentence(s: string, weights: Map<string, number>, first: boolean): number {
  const words = s.split(/\s+/).length;
  let score = 0;
  for (const w of new Set(tokenize(s))) score += weights.get(w) ?? 0;
  score /= 1 + words / 25;
  if (CUES.test(s)) score += 1.5;
  if (first) score += 1;
  if (/\?$/.test(s)) score -= 1.5;
  if (s.length < 45 || s.length > 240) score *= 0.6;
  if ((s.match(/[\d()[\]{}<>/\\|=]/g) ?? []).length > s.length * 0.12) score *= 0.5;
  return score;
}

type SceneDraft = Omit<Scene, "id"> & { order: number };

function sectionScenes(
  sec: Section,
  sectionCount: number,
  weights: Map<string, number>,
  keywords: string[],
  P: Phrases,
  showEyebrow: boolean,
): { drafts: SceneDraft[]; plain: Scored[] } {
  const units = toUnits(sec.lines);
  const quota = {
    concept: sectionCount === 1 ? 4 : sectionCount <= 3 ? 2 : 1,
    def: sectionCount > 5 ? 1 : 2,
    formula: sectionCount > 5 ? 1 : 2,
  };
  const used = { def: 0, formula: 0, code: 0, example: 0, steps: 0, list: 0 };
  const drafts: SceneDraft[] = [];
  const plain: Scored[] = [];
  const base = { eyebrow: showEyebrow ? sec.title : undefined, keywords };
  const skip = new Set<number>();
  let seenSentence = false;

  units.forEach((u, i) => {
    if (skip.has(i)) return;
    if (u.type === "formula") {
      const prev = units[i - 1];
      const next = units[i + 1];
      const context = prev?.type === "sent" ? prev.text : next?.type === "sent" ? next.text : "";
      if (u.code) {
        if (used.code++ >= 5) return;
        drafts.push({
          ...base,
          order: i,
          kind: "formula",
          code: true,
          title: sec.title,
          page: u.page,
          formula: u.text,
          caption: context ? clip(context, 200) : undefined,
          narration: [P.codeIntro(context ? clip(context, 240) : ""), u.text],
        });
        return;
      }
      if (used.formula++ >= quota.formula) return;
      drafts.push({
        ...base,
        order: i,
        kind: "formula",
        title: sec.title,
        page: u.page,
        formula: u.text,
        caption: context ? clip(context, 200) : undefined,
        narration: [P.formulaIntro(speakFormula(u.text)), ...(context ? [clip(context, 300)] : [])],
      });
    } else if (u.type === "list") {
      const items = u.items.slice(0, 5).map((s) => clip(s, 150));
      if (u.ordered && used.steps++ < 1) {
        drafts.push({
          ...base,
          order: i,
          kind: "steps",
          title: sec.title,
          page: u.page,
          steps: items,
          narration: [P.stepsIntro, ...items],
        });
      } else if (!u.ordered && used.list++ < 1) {
        const bullets = items.slice(0, 4);
        drafts.push({ ...base, order: i, kind: "concept", title: sec.title, page: u.page, bullets, narration: bullets });
      }
    } else {
      const text = u.text;
      if (text.length < 25) return;
      const def = used.def < quota.def ? parseDefinition(text) : null;
      if (def) {
        used.def++;
        drafts.push({
          ...base,
          order: i,
          kind: "definition",
          title: def.term,
          page: u.page,
          term: def.term,
          definition: clip(def.definition, 260),
          narration: [P.defIntro(def.term), clip(text, 320)],
        });
      } else if (EXAMPLE.test(text) && used.example < 1 && text.length > 40) {
        used.example++;
        const bullets = [clip(text, 190)];
        const next = units[i + 1];
        if (next?.type === "sent" && next.text.length > 30) {
          bullets.push(clip(next.text, 190));
          skip.add(i + 1);
        }
        drafts.push({
          ...base,
          order: i,
          kind: "example",
          title: sec.title,
          page: u.page,
          bullets,
          narration: [P.exampleIntro, ...bullets],
        });
      } else if (text.length <= 420) {
        plain.push({ text, page: u.page, order: i, score: scoreSentence(text, weights, !seenSentence) });
      }
      seenSentence = true;
    }
  });

  // Keep only the strongest sentences, then present them in reading order.
  const picked = [...plain]
    .sort((a, b) => b.score - a.score)
    .slice(0, quota.concept * 3)
    .sort((a, b) => a.order - b.order);
  const groups: Scored[][] = [];
  for (let i = 0; i < picked.length; i += 3) groups.push(picked.slice(i, i + 3));
  if (groups.length > 1 && groups[groups.length - 1].length === 1) {
    groups[groups.length - 2].push(...groups.pop()!);
  }
  for (const g of groups) {
    const bullets = g.map((s) => clip(s.text, 190));
    drafts.push({
      ...base,
      order: g[0].order,
      kind: "concept",
      title: sec.title,
      page: g[0].page,
      bullets,
      narration: bullets,
    });
  }

  drafts.sort((a, b) => a.order - b.order);
  return { drafts, plain };
}

function buildChapter(raw: RawChapter, index: number, endPage: number, P: Phrases): Chapter | null {
  const text = raw.sections.map((s) => s.lines.map((l) => l.text).join(" ")).join("\n\n");
  const keywords = topKeywords(text, 10, raw.sections.map((s) => s.title));
  const weights = new Map(keywords.map((k, i) => [k, 2 - i * 0.12]));
  const title = clip(raw.title.replace(/\s+/g, " "), 80);
  const drafts: Omit<Scene, "id">[] = [];
  const allPlain: Scored[] = [];
  const content = raw.sections.filter((s) => sectionChars(s) > 15);

  const shown = keywords.slice(0, 6).map(titleCase);
  drafts.push({
    kind: "title",
    title,
    page: raw.page,
    keywords,
    bullets: shown,
    narration: [P.intro(title), ...(shown.length >= 2 ? [P.overview(shown.slice(0, 4))] : [])],
  });

  for (const sec of content) {
    const showEyebrow = content.length > 1 && sec.title !== raw.title;
    const { drafts: d, plain } = sectionScenes(sec, content.length, weights, keywords, P, showEyebrow);
    for (const draft of d) drafts.push(draft);
    allPlain.push(...plain);
  }
  if (drafts.length < 2) return null;

  if (drafts.length >= 4) {
    const seen = new Set<string>();
    const points = allPlain
      .filter((s) => s.text.length >= 45 && s.text.length <= 200 && !seen.has(s.text) && seen.add(s.text))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((s) => clip(s.text, 150));
    if (points.length >= 2) {
      drafts.push({
        kind: "summary",
        title,
        page: endPage,
        keywords,
        bullets: points,
        narration: [P.recap(title), ...points],
      });
    }
  }

  return {
    id: `c${index}`,
    number: index + 1,
    title,
    startPage: raw.page,
    endPage,
    keywords,
    text: text.slice(0, 9000),
    scenes: drafts.map((s, i) => ({ ...s, id: `c${index}-s${i}` })),
  };
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

function pickTitle(ex: ExtractedPdf, body: number): string {
  if (ex.title) return clip(ex.title, 90);
  const first = ex.lines.filter((l) => l.page === 1 && l.text.length > 3 && l.text.length < 90);
  const big = [...first].sort((a, b) => b.size - a.size)[0];
  if (big && big.size >= body * 1.3) return big.text;
  return ex.fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function computeStats(chapters: Chapter[]): Lesson["stats"] {
  const all = chapters.flatMap((c) => c.scenes);
  const count = (k: Scene["kind"]) => all.filter((s) => s.kind === k).length;
  return {
    scenes: all.length,
    concepts: count("concept"),
    definitions: count("definition"),
    formulas: all.filter((s) => s.kind === "formula" && !s.code).length,
    commands: all.filter((s) => s.code).length,
    examples: count("example") + count("steps"),
  };
}

export async function buildLesson(ex: ExtractedPdf, onProgress: (p: Progress) => void): Promise<Lesson> {
  onProgress({ stage: "structuring", done: 0, total: 1 });
  await new Promise((r) => setTimeout(r, 0));

  const lang = detectLang(ex.lines.slice(0, 400).map((l) => l.text).join(" "));
  const P = PHRASES[lang];
  const lines = cleanLines(ex);
  const body = bodySize(lines);
  const title = pickTitle(ex, body);
  const raw = toChapters(ex, lines, toSections(lines, body, P), title, P);

  const chapters: Chapter[] = [];
  for (let i = 0; i < raw.length; i++) {
    const endPage = Math.max(raw[i].page, (raw[i + 1]?.page ?? ex.pageCount + 1) - 1);
    const ch = buildChapter(raw[i], chapters.length, endPage, P);
    if (ch) chapters.push(ch);
    if (i % 5 === 0) {
      onProgress({ stage: "building", done: i + 1, total: raw.length });
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (!chapters.length) throw new Error("Couldn't find enough readable text to build a lesson from this PDF.");

  return { title, fileName: ex.fileName, pageCount: ex.pageCount, lang, chapters, stats: computeStats(chapters) };
}
