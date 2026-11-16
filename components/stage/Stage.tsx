"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Play } from "lucide-react";
import type { Lesson, Scene } from "@/lib/types";
import { Subtitles, Teacher } from "./parts";
import { SceneView } from "./scenes";

interface Props {
  lesson: Lesson;
  scene: Scene;
  chapterNumber: number;
  beat: number;
  shown: number;
  playing: boolean;
  started: boolean;
  wordIndex: number;
  subtitles: boolean;
  onStart: () => void;
  onToggle: () => void;
}

const BLOBS = [
  { color: "#5b4bff", x: "-12%", y: "-30%", size: "62%", dur: 16 },
  { color: "#ff6b9d", x: "62%", y: "48%", size: "48%", dur: 20 },
  { color: "#22b8cf", x: "30%", y: "-45%", size: "42%", dur: 24 },
];

export function Stage({
  lesson,
  scene,
  chapterNumber,
  beat,
  shown,
  playing,
  started,
  wordIndex,
  subtitles,
  onStart,
  onToggle,
}: Props) {
  const dir = lesson.lang === "ar" ? "rtl" : "ltr";
  const line =
    scene.narration[Math.min(beat, scene.narration.length - 1)] ?? "";

  return (
    <div
      className="@container relative aspect-[4/5] w-full overflow-hidden rounded-3xl bg-stage shadow-[0_30px_80px_-30px_rgba(40,28,140,0.65)] ring-1 ring-black/10 sm:aspect-video"
      onClick={started ? onToggle : undefined}
      role="region"
      aria-label="Lesson stage"
    >
      {BLOBS.map((b, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute rounded-full opacity-55 blur-[9cqw]"
          style={{
            background: b.color,
            left: b.x,
            top: b.y,
            width: b.size,
            aspectRatio: "1",
          }}
          animate={{
            x: ["0%", "12%", "-6%", "0%"],
            y: ["0%", "-8%", "10%", "0%"],
          }}
          transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
      <div className="stage-grid pointer-events-none absolute inset-0" />

      <div
        className="absolute inset-0 px-[5cqw] pt-[4cqw] pb-[max(13.5cqw,70px)]"
        style={{ perspective: 1400 }}
      >
        {/* Scenes cross over each other, so a new scene never waits on the old one leaving. */}
        <div className="relative size-full">
          <AnimatePresence>
            <motion.div
              key={scene.id}
              className="preserve-3d absolute inset-0"
              initial={{ opacity: 0, rotateY: 28, x: "9%", scale: 0.94 }}
              animate={{ opacity: 1, rotateY: 0, x: "0%", scale: 1 }}
              exit={{
                opacity: 0,
                rotateY: -28,
                x: "-9%",
                scale: 0.94,
                transition: { duration: 0.25 },
              }}
              transition={{ duration: 0.45, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <SceneView
                scene={scene}
                shown={shown}
                beat={beat}
                chapterNumber={chapterNumber}
                dir={dir}
                lang={lesson.lang}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-[3cqw] bottom-[2.2cqw] flex items-end gap-[1.2cqw]">
        <Teacher speaking={playing} />
        {subtitles && started && (
          <div className="min-w-0 flex-1 pb-[0.4cqw]">
            <Subtitles
              text={line}
              wordIndex={playing ? wordIndex : 999}
              dir={dir}
            />
          </div>
        )}
      </div>

      <AnimatePresence>
        {!started && (
          <motion.div
            className="absolute inset-0 grid place-items-center bg-stage/75 p-[5cqw] text-center backdrop-blur-md"
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.35 }}
          >
            <div className="max-w-[80cqw]">
              <p className="st-small font-semibold tracking-[0.2em] text-sun uppercase">
                Your lesson is ready
              </p>
              <h2
                dir={dir}
                className="st-h2 mt-[0.4em] font-display font-bold text-white"
              >
                {lesson.title}
              </h2>
              <div className="st-small mt-[1.6em] flex flex-wrap justify-center gap-[0.7em] text-white/85">
                {[
                  [lesson.chapters.length, "chapters"],
                  [lesson.stats.scenes, "scenes"],
                  [lesson.stats.definitions, "definitions"],
                  [lesson.stats.formulas, "formulas"],
                  [lesson.stats.commands, "commands"],
                  [lesson.stats.examples, "examples"],
                ]
                  .filter(([n]) => Number(n) > 0)
                  .map(([n, label]) => (
                    <span
                      key={label}
                      className="rounded-full border border-white/15 bg-white/10 px-[1em] py-[0.5em]"
                    >
                      <b className="text-white">{n}</b> {label}
                    </span>
                  ))}
              </div>
              <motion.button
                type="button"
                onClick={onStart}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.96 }}
                className="st-body mt-[1.6em] inline-flex items-center gap-[0.6em] rounded-full bg-white px-[1.6em] py-[0.8em] font-display font-semibold text-brand-deep shadow-[0_0_60px_rgba(143,132,255,0.8)] focus-visible:outline-4 focus-visible:outline-sun"
              >
                <Play className="size-[1.1em] fill-current" /> Start lesson
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
