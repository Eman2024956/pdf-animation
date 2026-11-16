"use client";

import { motion } from "framer-motion";
import { BookOpen, Captions, FileUp, Layers, Play, Sparkles, Upload, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LessonPlayer } from "@/components/LessonPlayer";
import { buildLesson } from "@/lib/lesson/build";
import { extractPdf } from "@/lib/pdf/extract";
import type { Lesson, Progress } from "@/lib/types";

type View =
  | { name: "idle"; error?: string }
  | { name: "processing"; fileName: string; progress: Progress }
  | { name: "lesson"; lesson: Lesson };

const STAGES: { key: Progress["stage"]; label: string }[] = [
  { key: "reading", label: "Reading pages" },
  { key: "structuring", label: "Finding chapters and headings" },
  { key: "building", label: "Detecting concepts and building scenes" },
];

export default function Home() {
  const [view, setView] = useState<View>({ name: "idle" });
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const process = useCallback(async (source: File | { url: string; name: string }) => {
    if (source instanceof File && source.type !== "application/pdf" && !/\.pdf$/i.test(source.name)) {
      setView({ name: "idle", error: "That file isn't a PDF. Choose a .pdf file." });
      return;
    }
    const onProgress = (progress: Progress) => setView({ name: "processing", fileName: source.name, progress });
    onProgress({ stage: "reading", done: 0, total: 1 });
    try {
      const extracted = await extractPdf(source, onProgress);
      const lesson = await buildLesson(extracted, onProgress);
      setView({ name: "lesson", lesson });
    } catch (e) {
      console.error(e);
      const known = e instanceof Error && /PDF|lesson/.test(e.message);
      setView({ name: "idle", error: known ? (e as Error).message : "This PDF couldn't be read. It may be damaged or password-protected." });
    }
  }, []);

  // Allow deep-linking to a PDF hosted on this site: /?src=/sample.pdf
  useEffect(() => {
    const src = new URLSearchParams(window.location.search).get("src");
    if (!src?.startsWith("/") || src.startsWith("//")) return;
    const id = setTimeout(() => process({ url: src, name: decodeURIComponent(src.split("/").pop() ?? "document.pdf") }), 0);
    return () => clearTimeout(id);
  }, [process]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 lg:px-6">
          <button type="button" onClick={() => setView({ name: "idle" })} className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-brand">
            <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-rose text-white shadow-md shadow-brand/30">
              <Play className="size-4 translate-x-px fill-current" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">BookMotion</span>
          </button>
          {view.name === "lesson" && (
            <>
              <span className="hidden h-6 w-px bg-line sm:block" />
              <p dir="auto" className="hidden min-w-0 flex-1 truncate text-sm font-medium text-ink-soft sm:block">
                {view.lesson.title}
              </p>
              <button
                type="button"
                onClick={() => setView({ name: "idle" })}
                className="ms-auto inline-flex h-9 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-paper focus-visible:outline-2 focus-visible:outline-brand"
              >
                <FileUp className="size-4" /> New PDF
              </button>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 pt-5">
        <>
          {view.name === "lesson" ? (
            <motion.div key="lesson" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <LessonPlayer
                key={view.lesson.fileName + view.lesson.pageCount}
                lesson={view.lesson}
                onLessonChange={(lesson) => setView({ name: "lesson", lesson })}
              />
            </motion.div>
          ) : view.name === "processing" ? (
            <motion.div key="processing" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Processing fileName={view.fileName} progress={view.progress} />
            </motion.div>
          ) : (
            <motion.section
              key="idle"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto max-w-5xl px-4 pt-6 pb-16 text-center sm:pt-14"
            >
              <p className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/10 px-3.5 py-1.5 text-sm font-semibold text-brand-deep">
                <Sparkles className="size-4" /> Your textbook, taught out loud
              </p>
              <h1 className="mx-auto mt-5 max-w-3xl font-display text-4xl leading-[1.08] font-bold tracking-tight text-balance sm:text-6xl">
                Turn any PDF into an{" "}
                <span className="bg-gradient-to-r from-brand via-rose to-sun bg-clip-text text-transparent">animated lesson</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-lg text-ink-soft text-pretty">
                Drop in a textbook. BookMotion finds the chapters, key ideas, definitions and formulas, then teaches them scene by scene with narration.
              </p>

              <motion.div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) process(f);
                }}
                animate={{ scale: dragging ? 1.02 : 1 }}
                className={`mx-auto mt-9 max-w-2xl rounded-3xl border-2 border-dashed bg-white p-8 shadow-[0_30px_70px_-40px_rgba(61,47,214,0.5)] transition-colors sm:p-10 ${
                  dragging ? "border-brand bg-brand/5" : "border-[#cfcaf0]"
                }`}
              >
                <motion.div
                  className="mx-auto grid size-16 place-items-center rounded-2xl bg-gradient-to-br from-brand to-[#8f84ff] text-white shadow-lg shadow-brand/40"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Upload className="size-7" />
                </motion.div>
                <p className="mt-4 font-display text-xl font-semibold">Drop your PDF here</p>
                <p className="mt-1 text-sm text-ink-soft">It&apos;s processed in your browser. Large books are fine, and nothing is uploaded.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => input.current?.click()}
                    className="inline-flex h-12 items-center gap-2 rounded-full bg-brand px-6 font-semibold text-white shadow-lg shadow-brand/35 transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <FileUp className="size-5" /> Choose a PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => process({ url: "/sample.pdf", name: "Forces and Motion (sample).pdf" })}
                    className="inline-flex h-12 items-center gap-2 rounded-full border border-line bg-white px-6 font-semibold transition-colors hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <Play className="size-4 fill-current" /> Try the sample
                  </button>
                </div>
                <input
                  ref={input}
                  type="file"
                  accept="application/pdf,.pdf"
                  className="sr-only"
                  aria-label="Choose a PDF file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) process(f);
                    e.target.value = "";
                  }}
                />
                {view.error && (
                  <p role="alert" className="mx-auto mt-5 max-w-md rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {view.error}
                  </p>
                )}
              </motion.div>

              <ul className="mx-auto mt-12 grid max-w-4xl gap-4 text-start sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { icon: Layers, title: "Scenes, not pages", body: "Each section becomes short animated scenes." },
                  { icon: BookOpen, title: "Finds what matters", body: "Definitions, formulas, examples and steps." },
                  { icon: Captions, title: "Narrated", body: "A voice teaches each scene, with subtitles." },
                  { icon: Zap, title: "Built for big books", body: "Pages stream through one at a time." },
                ].map(({ icon: Icon, title, body }, i) => (
                  <motion.li
                    key={title}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 + i * 0.08 }}
                    className="rounded-2xl border border-line bg-white p-4"
                  >
                    <Icon className="size-5 text-brand" />
                    <p className="mt-2 font-semibold">{title}</p>
                    <p className="mt-0.5 text-sm text-ink-soft">{body}</p>
                  </motion.li>
                ))}
              </ul>
            </motion.section>
          )}
        </>
      </main>
    </div>
  );
}

function Processing({ fileName, progress }: { fileName: string; progress: Progress }) {
  const stageIndex = STAGES.findIndex((s) => s.key === progress.stage);
  const pct = progress.stage === "reading" ? (progress.done / Math.max(1, progress.total)) * 80 : progress.stage === "structuring" ? 85 : 85 + (progress.done / Math.max(1, progress.total)) * 15;

  return (
    <section className="mx-auto max-w-lg px-4 pt-10 text-center sm:pt-20" aria-live="polite">
      <div className="relative mx-auto size-28" style={{ perspective: 600 }}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute inset-0 rounded-2xl border border-line bg-white shadow-md"
            style={{ transformOrigin: "left center" }}
            animate={{ rotateY: [0, -150, 0] }}
            transition={{ duration: 2.1, repeat: Infinity, delay: i * 0.35, ease: "easeInOut" }}
          >
            <div className="m-4 space-y-2">
              <div className="h-2 w-3/4 rounded bg-brand/40" />
              <div className="h-2 rounded bg-line" />
              <div className="h-2 w-5/6 rounded bg-line" />
              <div className="h-2 w-2/3 rounded bg-line" />
            </div>
          </motion.div>
        ))}
      </div>
      <h2 className="mt-8 font-display text-2xl font-bold">Building your lesson</h2>
      <p dir="auto" className="mt-1 truncate text-sm text-ink-soft">{fileName}</p>

      <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <motion.div className="h-full rounded-full bg-gradient-to-r from-brand via-rose to-sun" animate={{ width: `${pct}%` }} transition={{ ease: "easeOut" }} />
      </div>

      <ol className="mt-6 space-y-2.5 text-start">
        {STAGES.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-3 text-sm ${i <= stageIndex ? "text-ink" : "text-ink-soft/60"}`}>
            <span
              className={`grid size-6 place-items-center rounded-full text-xs font-bold ${
                i < stageIndex ? "bg-mint text-white" : i === stageIndex ? "bg-brand text-white" : "bg-line text-ink-soft"
              }`}
            >
              {i < stageIndex ? "✓" : i + 1}
            </span>
            <span className="font-medium">{s.label}</span>
            {i === stageIndex && s.key === "reading" && progress.total > 1 && (
              <span className="ms-auto tabular-nums text-ink-soft">
                {progress.done} / {progress.total}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
