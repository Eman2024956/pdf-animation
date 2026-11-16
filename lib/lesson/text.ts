const STOP_EN = new Set(
  `about above after again against also although always among another because been before being below between both
  cannot could does doing down during each either else ever every from further have having here hers herself himself
  however into itself just least less like made make many might more most much must myself near need neither never
  next none nothing often once only onto other others ought ours ourselves over same shall should since some such
  than that their theirs them themselves then there therefore these they this those though through thus together
  toward under until upon used uses using very want were what when where whether which while whom whose will with
  within without would your yours yourself yourselves called known given show shown shows figure table chapter
  section example page since still take takes when well very first second third also many much than then them
  with will have been more most some into only other such each both must said says seen part parts form forms
  kind kinds type types different important following result results include includes including called
  around across along away back even give gives given goes going keep keeps know known large larger small smaller
  stay stays tell tells thing things come comes becomes become get gets getting look looks need needs work works
  help helps let lets able already almost another anything something everything simply usually really quite
  good best better high higher highest less least long short wide whole certain several various common
  change changes changing start starts end ends want wants way ways your their there where being`.split(/\s+/),
);

const STOP_AR = new Set(
  `التي الذي الذين هذا هذه ذلك تلك على إلى الى عند عندما حيث كما لكن لأن أيضا أيضاً بين خلال حتى بعد قبل
  كان كانت يكون تكون ليس ليست هناك هنا نحن أنهم انها أنها أنه انه مثل غير بعض كل وهو وهي هو هي ثم لقد قد
  الذى اللذين منها منه فيها فيه عليها عليه لها له بها به عن مع من في ما لا أن إن أو`.split(/\s+/),
);

export function detectLang(sample: string): "en" | "ar" {
  const ar = (sample.match(/[؀-ۿ]/g) ?? []).length;
  const la = (sample.match(/[A-Za-z]/g) ?? []).length;
  // Arabic technical books are full of Latin terms and commands, so a modest share is enough.
  return ar > 40 && ar > (ar + la) * 0.15 ? "ar" : "en";
}

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const w of text.toLowerCase().match(/\p{L}[\p{L}'’-]{3,}/gu) ?? []) {
    if (!STOP_EN.has(w) && !STOP_AR.has(w)) out.push(w);
  }
  return out;
}

/** Most frequent meaningful words, lightly stemmed so plurals merge. */
export function topKeywords(text: string, n: number, headings: string[] = []): string[] {
  const minCount = text.length > 4000 ? 3 : 2;
  const counts = new Map<string, { n: number; forms: Map<string, number> }>();
  for (const w of tokenize(text)) {
    const stem = w.replace(/(ies)$/u, "y").replace(/(?<=[a-z]{3})(es|s)$/u, "");
    const e = counts.get(stem) ?? { n: 0, forms: new Map() };
    e.n++;
    e.forms.set(w, (e.forms.get(w) ?? 0) + 1);
    counts.set(stem, e);
  }
  // Words from headings are the author's own choice of key terms, so they rank first.
  const fromHeadings = [...new Set(headings.flatMap(tokenize))].filter((w) => text.toLowerCase().includes(w));
  const frequent = [...counts.values()]
    .filter((e) => e.n >= minCount)
    .sort((a, b) => b.n - a.n)
    .map((e) => [...e.forms.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return [...new Set([...fromHeadings.slice(0, Math.ceil(n / 2)), ...frequent])].slice(0, n);
}

const ABBR = /(?:\b(?:e\.g|i\.e|etc|vs|figs?|eqs?|dr|mr|mrs|ms|prof|no|vol|ch|sec|pp|al|approx|cf)|\b\p{Lu})\.$/iu;

export function splitSentences(text: string): string[] {
  const raw = text
    .replace(/\[\d+(?:[,–-]\s*\d+)*\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?؟。])\s+/u);
  const out: string[] = [];
  for (const piece of raw) {
    const prev = out[out.length - 1];
    if (prev && (ABBR.test(prev) || /^\p{Ll}/u.test(piece))) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out.map((s) => s.trim()).filter(Boolean);
}

export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > max * 0.6 ? at : max).replace(/[,;:\s]+$/, "")}…`;
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Turns "E = mc^2" into something a speech engine reads naturally. */
export function speakFormula(f: string): string {
  return f
    .replace(/\^2|²/g, " squared ")
    .replace(/\^3|³/g, " cubed ")
    .replace(/\^/g, " to the power of ")
    .replace(/≈/g, " is approximately ")
    .replace(/≤/g, " is less than or equal to ")
    .replace(/≥/g, " is greater than or equal to ")
    .replace(/[→⇌]/g, " yields ")
    .replace(/=/g, " equals ")
    .replace(/\+/g, " plus ")
    .replace(/[×·*]/g, " times ")
    .replace(/[÷/]/g, " over ")
    .replace(/√/g, " the square root of ")
    .replace(/\s+/g, " ")
    .trim();
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
