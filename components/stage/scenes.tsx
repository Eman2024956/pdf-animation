"use client";

import { AnimatePresence, motion } from "framer-motion";
import { BookMarked, BookOpen, Check, Lightbulb, ListOrdered, Sigma, Sparkles, Terminal, Trophy } from "lucide-react";
import type { Scene } from "@/lib/types";
import { clip } from "@/lib/lesson/text";
import { Eyebrow, Highlight, Orbit3D } from "./parts";

export interface SceneProps {
  scene: Scene;
  /** How many beats have been revealed (large number = everything). */
  shown: number;
  /** The beat being narrated right now. */
  beat: number;
  chapterNumber: number;
  dir: "ltr" | "rtl";
  lang: "en" | "ar";
}

const LABELS = {
  en: {
    chapter: "Chapter", page: "page", idea: "Key ideas", term: "Key term", ask: "What does it mean?",
    formula: "Formula", command: "Command", example: "Example", steps: "Step by step", recap: "Recap",
  },
  ar: {
    chapter: "الفصل", page: "صفحة", idea: "أفكار رئيسية", term: "مصطلح مهم", ask: "ماذا يعني؟",
    formula: "معادلة", command: "الأمر", example: "مثال", steps: "خطوة بخطوة", recap: "مراجعة",
  },
};

const TONE = {
  title: "#8f84ff",
  concept: "#4cc3ff",
  definition: "#2dd4a7",
  formula: "#ffb62e",
  example: "#ff6b9d",
  steps: "#4cc3ff",
  summary: "#2dd4a7",
} as const;

const spring = { type: "spring", stiffness: 240, damping: 24 } as const;

function Words({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {text.split(/\s+/).map((w, i) => (
        <span key={i} className="inline-block overflow-hidden pb-[0.12em] align-bottom">
          <motion.span
            className="inline-block"
            initial={{ y: "110%", rotate: 6 }}
            animate={{ y: 0, rotate: 0 }}
            transition={{ ...spring, delay: 0.15 + i * 0.07 }}
          >
            {w}&nbsp;
          </motion.span>
        </span>
      ))}
    </span>
  );
}

/* ----------------------------- Title ------------------------------ */

function TitleScene({ scene, shown, chapterNumber, dir, lang }: SceneProps) {
  const L = LABELS[lang];
  const nodes = scene.bullets ?? [];
  const showNodes = scene.narration.length < 2 || shown >= 1;
  return (
    <div className="grid h-full grid-cols-1 items-center gap-[3cqw] @3xl:grid-cols-[1.05fr_0.95fr]">
      <div dir={dir} className="min-w-0">
        <Eyebrow icon={BookOpen} label={`${L.chapter} ${chapterNumber} · ${L.page} ${scene.page}`} tone={TONE.title} />
        <h2 className="st-h1 mt-[0.45em] font-display font-bold tracking-tight text-white">
          <Words text={clip(scene.title, 70)} />
        </h2>
        <motion.div
          className="mt-[2.2cqw] h-[0.5cqw] max-h-1.5 min-h-1 rounded-full bg-gradient-to-r from-brand via-rose to-sun"
          initial={{ width: 0 }}
          animate={{ width: "55%" }}
          transition={{ duration: 0.9, delay: 0.6, ease: "easeOut" }}
        />
      </div>

      <div className="relative mx-auto aspect-[5/4] w-full max-w-[46cqw] @max-3xl:max-w-[70cqw]">
        <svg viewBox="0 0 100 80" className="absolute inset-0 size-full" aria-hidden>
          {showNodes &&
            nodes.map((_, i) => {
              const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
              return (
                <motion.line
                  key={i}
                  x1="50"
                  y1="40"
                  x2={50 + Math.cos(a) * 36}
                  y2={40 + Math.sin(a) * 28}
                  stroke="rgba(255,255,255,0.35)"
                  strokeWidth="0.5"
                  strokeDasharray="1.5 1.5"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: i * 0.12 }}
                />
              );
            })}
        </svg>
        <motion.div
          className="absolute top-1/2 left-1/2 grid size-[24%] -translate-1/2 place-items-center rounded-full bg-gradient-to-br from-white to-[#b9b2ff] shadow-[0_0_7cqw_rgba(143,132,255,0.9)]"
          initial={{ scale: 0, rotate: -40 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...spring, delay: 0.3 }}
        >
          <BookOpen className="size-1/2 text-brand-deep" strokeWidth={2.2} />
        </motion.div>
        {showNodes &&
          nodes.map((k, i) => {
            const a = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
            return (
              <motion.div
                key={k}
                className="absolute -translate-1/2"
                style={{ left: `${50 + Math.cos(a) * 38}%`, top: `${50 + Math.sin(a) * 37}%` }}
                initial={{ opacity: 0, scale: 0.3 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ ...spring, delay: 0.15 + i * 0.12 }}
              >
                <motion.span
                  className="st-small block rounded-full border border-white/20 bg-white/12 px-[1em] py-[0.5em] font-semibold whitespace-nowrap text-white backdrop-blur"
                  animate={{ y: [0, i % 2 ? 5 : -5, 0] }}
                  transition={{ duration: 3.5 + i * 0.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  {k}
                </motion.span>
              </motion.div>
            );
          })}
      </div>
    </div>
  );
}

/* ---------------------------- Concept ----------------------------- */

function BulletList({ scene, shown, beat, offset, tone, dir }: SceneProps & { offset: number; tone: string }) {
  const bullets = scene.bullets ?? [];
  return (
    <ul dir={dir} className="mt-[1.8cqw] flex flex-col gap-[1.1cqw]">
      <AnimatePresence>
        {bullets.map((b, i) =>
          shown >= i + offset ? (
            <motion.li
              key={i}
              layout
              initial={{ opacity: 0, x: dir === "rtl" ? 40 : -40, rotateX: -35 }}
              animate={{ opacity: beat === i + offset || shown > 50 ? 1 : 0.62, x: 0, rotateX: 0 }}
              transition={spring}
              className="st-body flex items-start gap-[0.8em] rounded-[1.2cqw] border border-white/10 bg-white/[0.07] px-[1em] py-[0.7em] text-white/90 backdrop-blur-sm"
              style={{ boxShadow: beat === i + offset ? `inset 3px 0 0 ${tone}, 0 0 3cqw -1cqw ${tone}` : undefined }}
            >
              <span
                className="st-small mt-[0.15em] grid size-[1.9em] shrink-0 place-items-center rounded-full font-bold text-stage"
                style={{ background: tone }}
              >
                {i + 1}
              </span>
              <span className="min-w-0">
                <Highlight text={b} keywords={scene.keywords} />
              </span>
            </motion.li>
          ) : null,
        )}
      </AnimatePresence>
    </ul>
  );
}

function ConceptScene(props: SceneProps) {
  const { scene, beat, dir, lang } = props;
  return (
    <div className="grid h-full grid-cols-1 items-center gap-[3cqw] @3xl:grid-cols-[1.7fr_1fr]">
      <div className="min-w-0" style={{ perspective: 1000 }}>
        <Eyebrow icon={Lightbulb} label={LABELS[lang].idea} tone={TONE.concept} />
        <h3 dir={dir} className="st-h2 mt-[0.5em] font-display font-semibold text-white">
          {clip(scene.eyebrow ?? scene.title, 64)}
        </h3>
        <BulletList {...props} offset={0} tone={TONE.concept} />
      </div>
      <div className="hidden @3xl:block">
        <Orbit3D icon={Lightbulb} tone={TONE.concept} pulse={beat} />
      </div>
    </div>
  );
}

/* --------------------------- Definition --------------------------- */

function DefinitionScene({ scene, shown, dir, lang }: SceneProps) {
  return (
    <div className="mx-auto flex h-full max-w-[78cqw] flex-col items-center justify-center text-center @max-3xl:max-w-none">
      <Eyebrow icon={BookMarked} label={LABELS[lang].term} tone={TONE.definition} />
      <motion.h3
        dir={dir}
        className="st-h1 mt-[0.4em] bg-gradient-to-r from-white via-[#b8fbe6] to-mint bg-clip-text font-display font-bold text-transparent"
        initial={{ opacity: 0, scale: 0.6, filter: "blur(12px)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
        transition={{ ...spring, delay: 0.15 }}
      >
        {clip(scene.term ?? scene.title, 48)}
      </motion.h3>
      <svg viewBox="0 0 200 12" className="mt-[0.6cqw] h-[1.4cqw] min-h-2 w-[32cqw]" aria-hidden>
        <motion.path
          d="M4 8 C 50 0, 90 12, 196 5"
          fill="none"
          stroke={TONE.definition}
          strokeWidth="3"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
        />
      </svg>
      <div className="mt-[2.4cqw] w-full" style={{ perspective: 1100 }}>
        <AnimatePresence mode="wait">
          {shown >= 1 ? (
            <motion.div
              key="def"
              dir={dir}
              className="st-body origin-top rounded-[1.6cqw] border border-mint/40 bg-gradient-to-b from-white/14 to-white/5 px-[1.6em] py-[1.2em] text-white shadow-[0_2cqw_6cqw_-2cqw_rgba(45,212,167,0.55)] backdrop-blur"
              style={{ fontSize: "clamp(13.5px, 2.05cqw, 25px)" }}
              initial={{ rotateX: -88, opacity: 0 }}
              animate={{ rotateX: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 110, damping: 15 }}
            >
              <Highlight text={scene.definition ?? ""} keywords={scene.keywords} />
            </motion.div>
          ) : (
            <motion.div
              key="hint"
              className="st-body mx-auto w-fit rounded-full border border-dashed border-white/25 px-[1.4em] py-[0.6em] text-white/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.6, repeat: Infinity }}
            >
              {LABELS[lang].ask}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------------------- Formula ----------------------------- */

const SYMBOLS = ["π", "∑", "√", "∞", "Δ", "θ", "∫", "λ"];
const CODE_SYMBOLS = ["$", "{ }", "</>", "#", "&&", "~", "|", ">_"];

function FormulaScene({ scene, shown, dir, lang }: SceneProps) {
  const code = Boolean(scene.code);
  const tone = code ? "#2dd4a7" : TONE.formula;
  // Commands animate word by word so long lines stay smooth; formulas animate per character.
  const chars = code ? (scene.formula ?? "").split(/(?<=\s)/) : [...(scene.formula ?? "")];
  const length = (scene.formula ?? "").length;
  return (
    <div className="relative flex h-full flex-col items-center justify-center text-center">
      {(code ? CODE_SYMBOLS : SYMBOLS).map((s, i) => (
        <motion.span
          key={s}
          className={`st-h1 pointer-events-none absolute text-white/[0.07] ${code ? "font-mono" : "font-serif"}`}
          style={{ left: `${6 + ((i * 127) % 86)}%`, top: `${8 + ((i * 61) % 70)}%` }}
          animate={{ y: [0, -14, 0], rotate: [0, i % 2 ? 12 : -12, 0] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: "easeInOut" }}
          aria-hidden
        >
          {s}
        </motion.span>
      ))}
      <Eyebrow icon={code ? Terminal : Sigma} label={code ? LABELS[lang].command : LABELS[lang].formula} tone={tone} />
      {code && (
        <h3 dir={dir} className="st-h2 mt-[0.5em] font-display font-semibold text-white">
          {clip(scene.caption ?? scene.eyebrow ?? scene.title, 70)}
        </h3>
      )}
      <motion.div
        dir="ltr"
        className={`relative mt-[2cqw] max-w-full rounded-[2cqw] border bg-black/40 px-[4cqw] shadow-[0_0_8cqw_-2cqw_var(--glow)] ${code ? "border-mint/40 py-[2.4cqw] text-start" : "border-sun/40 py-[3cqw]"}`}
        style={{ "--glow": tone } as React.CSSProperties}
        initial={{ opacity: 0, scale: 0.85, rotateX: 30 }}
        animate={{ opacity: 1, scale: 1, rotateX: 0 }}
        transition={spring}
      >
        {code && (
          <span className="mb-[1.2cqw] flex gap-[0.7cqw]" aria-hidden>
            {["#ff6b6b", "#ffb62e", "#2dd4a7"].map((c) => (
              <span key={c} className="size-[1.1cqw] min-h-2 min-w-2 rounded-full" style={{ background: c }} />
            ))}
          </span>
        )}
        <p
          className={code ? "font-mono font-medium break-words whitespace-pre-wrap text-white" : "st-formula text-white italic"}
          style={
            code
              ? { fontSize: length > 60 ? "clamp(12px, 1.9cqw, 24px)" : length > 34 ? "clamp(13px, 2.5cqw, 32px)" : "clamp(15px, 3.4cqw, 44px)" }
              : length > 28
                ? { fontSize: "clamp(16px, 3.1cqw, 40px)" }
                : undefined
          }
        >
          {code && <span className="text-mint select-none">$ </span>}
          {chars.map((c, i) => (
            <motion.span
              key={i}
              className={
                code
                  ? /^--?\w/.test(c) ? "inline-block whitespace-pre text-sun" : i === 0 ? "inline-block whitespace-pre text-sky" : "inline-block whitespace-pre"
                  : /[=≈→⇌≤≥+\-×÷*/]/.test(c) ? "inline-block text-sun not-italic" : "inline-block"
              }
              initial={{ opacity: 0, y: 24, scale: 0.4 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...spring, delay: 0.3 + i * 0.045 }}
            >
              {c === " " ? " " : c}
            </motion.span>
          ))}
        </p>
        {!code && (
          <motion.span
            className="absolute inset-x-[4cqw] bottom-[1.6cqw] h-[0.3cqw] min-h-0.5 origin-left rounded-full bg-sun"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.4 + chars.length * 0.045 }}
          />
        )}
      </motion.div>
      {scene.caption && !code && shown >= 1 && (
        <motion.p
          dir={dir}
          className="st-body mt-[2.2cqw] max-w-[72cqw] text-white/85 @max-3xl:max-w-none"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
        >
          <Highlight text={scene.caption} keywords={scene.keywords} />
        </motion.p>
      )}
    </div>
  );
}

/* ---------------------------- Example ----------------------------- */

function ExampleScene(props: SceneProps) {
  const { scene, beat, dir, lang } = props;
  return (
    <div className="grid h-full grid-cols-1 items-center gap-[3cqw] @3xl:grid-cols-[1fr_1.9fr]">
      <motion.div
        className="relative mx-auto hidden aspect-square w-[22cqw] place-items-center rounded-[26%] bg-gradient-to-br from-rose to-[#ff9a5a] shadow-[0_0_8cqw_-1cqw_rgba(255,107,157,0.8)] @3xl:grid"
        initial={{ rotateY: -70, opacity: 0 }}
        animate={{ rotateY: [-70, 12, 0], opacity: 1 }}
        transition={{ duration: 0.9 }}
        style={{ perspective: 800 }}
      >
        <motion.div animate={{ scale: [1, 1.12, 1] }} transition={{ duration: 2.2, repeat: Infinity }} className="size-1/2">
          <Lightbulb className="size-full text-white" strokeWidth={1.8} />
        </motion.div>
      </motion.div>
      <div className="min-w-0" style={{ perspective: 1000 }}>
        <Eyebrow icon={Sparkles} label={LABELS[lang].example} tone={TONE.example} />
        <h3 dir={dir} className="st-h2 mt-[0.5em] font-display font-semibold text-white">
          {clip(scene.eyebrow ?? scene.title, 60)}
        </h3>
        <BulletList {...props} beat={beat} offset={1} tone={TONE.example} />
      </div>
    </div>
  );
}

/* ----------------------------- Steps ------------------------------ */

function StepsScene({ scene, shown, beat, dir, lang }: SceneProps) {
  const steps = scene.steps ?? [];
  const reached = Math.min(steps.length, Math.max(0, shown));
  return (
    <div className="mx-auto flex h-full max-w-[84cqw] flex-col justify-center @max-3xl:max-w-none">
      <Eyebrow icon={ListOrdered} label={LABELS[lang].steps} tone={TONE.steps} />
      <h3 dir={dir} className="st-h2 mt-[0.5em] font-display font-semibold text-white">
        {clip(scene.eyebrow ?? scene.title, 64)}
      </h3>
      <div dir={dir} className="relative mt-[2cqw] flex flex-col gap-[1.1cqw] ps-[4.4cqw] @max-3xl:ps-9">
        <div className="absolute inset-y-[1cqw] start-[1.55cqw] w-[0.35cqw] min-w-[3px] rounded-full bg-white/10 @max-3xl:start-3.5">
          <motion.div
            className="w-full origin-top rounded-full bg-gradient-to-b from-sky to-brand"
            animate={{ height: `${(reached / Math.max(1, steps.length)) * 100}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        {steps.map((s, i) => {
          const on = shown >= i + 1;
          return (
            <motion.div
              key={i}
              className="st-body relative rounded-[1.2cqw] border border-white/10 bg-white/[0.07] px-[1em] py-[0.6em] text-white/90"
              initial={false}
              animate={{ opacity: on ? (beat === i + 1 || shown > 50 ? 1 : 0.65) : 0.12, x: on ? 0 : 24, scale: beat === i + 1 ? 1.015 : 1 }}
              transition={spring}
            >
              <motion.span
                className="st-small absolute top-1/2 -start-[4.4cqw] grid size-[2.2em] -translate-y-1/2 place-items-center rounded-full font-bold @max-3xl:-start-9"
                animate={{ background: on ? TONE.steps : "rgba(255,255,255,0.14)", color: on ? "#0e0c2c" : "#fff", scale: beat === i + 1 ? 1.2 : 1 }}
              >
                {i + 1}
              </motion.span>
              {on ? <Highlight text={s} keywords={scene.keywords} /> : s}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------------------- Summary ----------------------------- */

function SummaryScene({ scene, shown, beat, dir, lang }: SceneProps) {
  const points = scene.bullets ?? [];
  return (
    <div className="grid h-full grid-cols-1 items-center gap-[3cqw] @3xl:grid-cols-[1.8fr_1fr]">
      <div className="min-w-0">
        <Eyebrow icon={Trophy} label={LABELS[lang].recap} tone={TONE.summary} />
        <h3 dir={dir} className="st-h2 mt-[0.5em] font-display font-semibold text-white">
          {clip(scene.title, 60)}
        </h3>
        <ul dir={dir} className="mt-[1.8cqw] flex flex-col gap-[1.1cqw]">
          {points.map((p, i) =>
            shown >= i + 1 ? (
              <motion.li
                key={i}
                className="st-body flex items-start gap-[0.8em] text-white/90"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: beat === i + 1 || shown > 50 ? 1 : 0.7, y: 0 }}
                transition={spring}
              >
                <span className="mt-[0.1em] grid size-[1.5em] shrink-0 place-items-center rounded-full bg-mint">
                  <motion.span initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...spring, delay: 0.2 }}>
                    <Check className="size-[1em] text-stage" strokeWidth={3.5} />
                  </motion.span>
                </span>
                <span className="min-w-0">
                  <Highlight text={p} keywords={scene.keywords} />
                </span>
              </motion.li>
            ) : null,
          )}
        </ul>
      </div>
      <div className="relative hidden @3xl:block">
        <Orbit3D icon={Trophy} tone={TONE.summary} pulse={beat} />
        {[...Array(8)].map((_, i) => (
          <motion.span
            key={i}
            className="absolute top-1/2 left-1/2 size-[0.9cqw] rounded-full"
            style={{ background: ["#ffb62e", "#ff6b9d", "#4cc3ff", "#2dd4a7"][i % 4] }}
            animate={{
              x: [0, Math.cos((i / 8) * 6.283) * 150],
              y: [0, Math.sin((i / 8) * 6.283) * 150],
              opacity: [1, 0],
              scale: [1, 0.4],
            }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, delay: i * 0.05 }}
          />
        ))}
      </div>
    </div>
  );
}

const SCENES = {
  title: TitleScene,
  concept: ConceptScene,
  definition: DefinitionScene,
  formula: FormulaScene,
  example: ExampleScene,
  steps: StepsScene,
  summary: SummaryScene,
};

export function SceneView(props: SceneProps) {
  const Component = SCENES[props.scene.kind];
  return <Component {...props} />;
}

export const SCENE_META = {
  title: { label: "Intro", icon: BookOpen, tone: TONE.title },
  concept: { label: "Key ideas", icon: Lightbulb, tone: TONE.concept },
  definition: { label: "Definition", icon: BookMarked, tone: TONE.definition },
  formula: { label: "Formula", icon: Sigma, tone: TONE.formula },
  example: { label: "Example", icon: Sparkles, tone: TONE.example },
  steps: { label: "Steps", icon: ListOrdered, tone: TONE.steps },
  summary: { label: "Recap", icon: Trophy, tone: TONE.summary },
} as const;
