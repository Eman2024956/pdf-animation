"use client";

import { motion } from "framer-motion";
import { Terminal } from "lucide-react";
import { useEffect, useRef } from "react";
import type { Lesson } from "@/lib/types";
import { SCENE_META } from "./stage/scenes";

interface Props {
  lesson: Lesson;
  current: { c: number; s: number };
  visited: Set<string>;
  onSelect: (chapter: number, scene: number) => void;
}

function Ring({ value, active }: { value: number; active: boolean }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 24 24" className="size-6 shrink-0 -rotate-90" aria-hidden>
      <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className={active ? "stroke-white/25" : "stroke-line"} />
      <circle
        cx="12"
        cy="12"
        r={r}
        fill="none"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        className={`transition-[stroke-dashoffset] duration-500 ${active ? "stroke-white" : "stroke-mint"}`}
      />
    </svg>
  );
}

export function ChapterNav({ lesson, current, visited, onSelect }: Props) {
  const dir = lesson.lang === "ar" ? "rtl" : "ltr";
  const total = lesson.stats.scenes;
  const activeRef = useRef<HTMLLIElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    chipRef.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [current.c]);

  return (
    <>
      {/* Mobile: horizontal chapter strip */}
      <nav aria-label="Chapters" className="thin-scroll -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {lesson.chapters.map((ch, i) => (
          <button
            key={ch.id}
            ref={i === current.c ? chipRef : undefined}
            type="button"
            dir={dir}
            onClick={() => onSelect(i, 0)}
            aria-current={i === current.c}
            className={`max-w-56 shrink-0 truncate rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors ${
              i === current.c ? "border-brand bg-brand text-white" : "border-line bg-white text-ink"
            }`}
          >
            {ch.number}. {ch.title}
          </button>
        ))}
      </nav>

      {/* Desktop: sidebar with scene list */}
      <aside className="hidden max-h-[calc(100vh-96px)] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-sm lg:sticky lg:top-20 lg:flex">
        <div className="border-b border-line p-4">
          <p className="text-xs font-semibold tracking-wider text-ink-soft uppercase">Lesson progress</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand to-mint"
              animate={{ width: `${(visited.size / Math.max(1, total)) * 100}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-ink-soft">
            {visited.size} of {total} scenes · {lesson.pageCount} pages
          </p>
        </div>
        <nav aria-label="Chapters" className="thin-scroll flex-1 overflow-y-auto p-2">
          <ol className="flex flex-col gap-1">
            {lesson.chapters.map((ch, i) => {
              const active = i === current.c;
              const done = ch.scenes.filter((s) => visited.has(s.id)).length / ch.scenes.length;
              return (
                <li key={ch.id} ref={active ? activeRef : undefined}>
                  <button
                    type="button"
                    onClick={() => onSelect(i, 0)}
                    aria-current={active}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                      active ? "bg-brand text-white shadow-md shadow-brand/30" : "hover:bg-paper"
                    }`}
                  >
                    <Ring value={done} active={active} />
                    <span className="min-w-0 flex-1">
                      <span dir={dir} className="block truncate text-sm font-semibold">
                        {ch.title}
                      </span>
                      <span className={`block text-xs ${active ? "text-white/75" : "text-ink-soft"}`}>
                        {ch.scenes.length} scenes · p. {ch.startPage}
                        {ch.endPage > ch.startPage ? `–${ch.endPage}` : ""}
                        {ch.enhanced ? " · AI" : ""}
                      </span>
                    </span>
                  </button>
                  {active && (
                    <motion.ol
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="ms-6 mt-1 overflow-hidden border-s-2 border-line ps-2"
                    >
                      {ch.scenes.map((s, j) => {
                        const meta = s.code ? { ...SCENE_META[s.kind], label: "Command", icon: Terminal } : SCENE_META[s.kind];
                        const Icon = meta.icon;
                        const here = j === current.s;
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              onClick={() => onSelect(i, j)}
                              aria-current={here}
                              className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-brand ${
                                here ? "bg-brand/10 font-semibold text-brand-deep" : "text-ink-soft hover:bg-paper hover:text-ink"
                              }`}
                            >
                              <Icon className="size-3.5 shrink-0" />
                              <span dir={dir} className="truncate">
                                {s.kind === "definition" ? `${meta.label}: ${s.title}` : s.code ? s.formula : `${meta.label}${s.eyebrow ? ` · ${s.eyebrow}` : ""}`}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </motion.ol>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>
      </aside>
    </>
  );
}
