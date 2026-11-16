"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Captions,
  CaptionsOff,
  Download,
  Film,
  Music,
  Square,
  FileText,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNarration, useVoices } from "@/hooks/useNarration";
import { narrationTrack, studioAvailable } from "@/lib/audio/studio";
import {
  buildMp3,
  canRecordVideo,
  downloadBlob,
  safeFileName,
  startRecording,
  type Recording,
} from "@/lib/export/media";
import { applyAiScenes, type AiScene } from "@/lib/lesson/ai";
import { computeStats } from "@/lib/lesson/build";
import { renderPageImage } from "@/lib/pdf/extract";
import type { Lesson } from "@/lib/types";
import { ChapterNav } from "./ChapterNav";
import { Stage } from "./stage/Stage";
import { SCENE_META } from "./stage/scenes";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const STUDIO = "__studio";

interface ExportState {
  busy: null | "audio" | "video";
  progress?: string;
  note?: string;
  error?: string;
}

interface Pos {
  c: number;
  s: number;
  b: number;
}

export function LessonPlayer({
  lesson,
  onLessonChange,
}: {
  lesson: Lesson;
  onLessonChange: (l: Lesson) => void;
}) {
  const [pos, setPos] = useState<Pos>({ c: 0, s: 0, b: 0 });
  const [nonce, setNonce] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [subtitles, setSubtitles] = useState(true);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [sourceOpen, setSourceOpen] = useState(false);
  const [ai, setAi] = useState<{
    available: boolean;
    busy: boolean;
    error?: string;
  }>({ available: false, busy: false });
  const [studioOk, setStudioOk] = useState(false);
  const [exp, setExp] = useState<ExportState>({ busy: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recording | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const finishVideoRef = useRef<() => void>(() => {});

  const chapter = lesson.chapters[Math.min(pos.c, lesson.chapters.length - 1)];
  const scene = chapter.scenes[Math.min(pos.s, chapter.scenes.length - 1)];
  const beat = Math.min(pos.b, scene.narration.length - 1);
  const text = scene.narration[beat] ?? "";

  const voices = useVoices(lesson.lang);
  const voice = useMemo(
    () => voices.find((v) => v.voiceURI === voiceURI) ?? voices[0] ?? null,
    [voices, voiceURI],
  );
  // Studio audio is the default whenever the server offers it, because it can be saved and recorded.
  const studio = studioOk && (voiceURI === "" || voiceURI === STUDIO);

  const live = useRef({ pos, lesson });
  useEffect(() => {
    live.current = { pos, lesson };
  });

  const goTo = useCallback((c: number, s: number) => {
    setPos({ c, s, b: 0 });
    setNonce((n) => n + 1);
  }, []);

  const step = useCallback(
    (delta: 1 | -1) => {
      const { pos: p, lesson: l } = live.current;
      if (delta === 1) {
        if (p.s < l.chapters[p.c].scenes.length - 1) goTo(p.c, p.s + 1);
        else if (p.c < l.chapters.length - 1) goTo(p.c + 1, 0);
      } else if (p.b > 0) goTo(p.c, p.s);
      else if (p.s > 0) goTo(p.c, p.s - 1);
      else if (p.c > 0) goTo(p.c - 1, l.chapters[p.c - 1].scenes.length - 1);
    },
    [goTo],
  );

  const onBeatEnd = useCallback(() => {
    const { pos: p, lesson: l } = live.current;
    const sc = l.chapters[p.c].scenes[p.s];
    if (p.b < sc.narration.length - 1) setPos({ ...p, b: p.b + 1 });
    else if (recRef.current && p.s === l.chapters[p.c].scenes.length - 1) {
      // A video export covers one chapter: hold the last frame briefly, then save.
      setPlaying(false);
      setTimeout(() => finishVideoRef.current(), 900);
    } else if (p.s < l.chapters[p.c].scenes.length - 1)
      setPos({ c: p.c, s: p.s + 1, b: 0 });
    else if (p.c < l.chapters.length - 1) setPos({ c: p.c + 1, s: 0, b: 0 });
    else setPlaying(false);
  }, []);

  const wordIndex = useNarration({
    beatKey: `${scene.id}:${beat}:${nonce}`,
    text,
    playing,
    rate,
    muted,
    voice,
    lang: lesson.lang,
    studio,
    onEnd: onBeatEnd,
  });

  const toggle = useCallback(() => {
    setStarted(true);
    setPlaying((p) => !p);
  }, []);

  useEffect(() => {
    setVisited((v) => (v.has(scene.id) ? v : new Set(v).add(scene.id)));
  }, [scene.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
      if (e.code === "Space") {
        if (tag === "BUTTON") return; // the focused button handles Space itself
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, step]);

  useEffect(() => {
    fetch("/api/enhance")
      .then((r) => r.json())
      .then((d) => setAi((a) => ({ ...a, available: Boolean(d.available) })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    studioAvailable().then(setStudioOk);
    return () => {
      abortRef.current?.abort();
      void recRef.current?.stop();
      recRef.current = null;
    };
  }, []);

  const exportAudio = async (scope: "chapter" | "lesson") => {
    setMenuOpen(false);
    const chapters = scope === "chapter" ? [chapter] : lesson.chapters;
    const lines = chapters.flatMap((c) => c.scenes.flatMap((s) => s.narration));
    const control = new AbortController();
    abortRef.current = control;
    setExp({ busy: "audio", progress: `0 / ${lines.length}` });
    try {
      const blob = await buildMp3(
        lines,
        lesson.lang,
        (d, t) => setExp({ busy: "audio", progress: `${d} / ${t}` }),
        control.signal,
      );
      const name =
        scope === "chapter"
          ? `${lesson.title} - ${chapter.number} ${chapter.title}`
          : lesson.title;
      downloadBlob(blob, `${safeFileName(name)}.mp3`);
      setExp({ busy: null, note: "MP3 saved to your downloads." });
    } catch (e) {
      const cancelled = e instanceof DOMException && e.name === "AbortError";
      setExp({
        busy: null,
        error: cancelled
          ? undefined
          : e instanceof Error
            ? e.message
            : "The audio export failed.",
      });
    }
  };

  const exportVideo = async () => {
    setMenuOpen(false);
    setPlaying(false);
    if (!stageRef.current) return;
    try {
      const withVoice = studio && !muted;
      recRef.current = await startRecording(
        stageRef.current,
        withVoice ? narrationTrack() : null,
        () => finishVideoRef.current(),
      );
      setExp({ busy: "video" });
      setStarted(true);
      goTo(pos.c, 0);
      setTimeout(() => setPlaying(true), 700);
    } catch (e) {
      const declined =
        e instanceof DOMException &&
        (e.name === "NotAllowedError" || e.name === "AbortError");
      setExp({
        busy: null,
        error: declined
          ? undefined
          : "This browser couldn't start a recording. Try Chrome or Edge.",
      });
    }
  };

  const finishVideo = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setPlaying(false);
    const blob = await rec.stop();
    downloadBlob(
      blob,
      `${safeFileName(`${lesson.title} - ${chapter.number} ${chapter.title}`)}.${rec.ext}`,
    );
    const notes = [`Video saved as .${rec.ext}.`];
    if (!rec.cropped)
      notes.push(
        "This browser can't crop to the stage, so the whole tab was recorded.",
      );
    if (!studio || muted)
      notes.push(
        "It has no narration audio: only the studio voice can be recorded.",
      );
    setExp({ busy: null, note: notes.join(" ") });
  };
  useEffect(() => {
    finishVideoRef.current = finishVideo;
  });

  const enhance = async () => {
    setAi((a) => ({ ...a, busy: true, error: undefined }));
    setPlaying(false);
    try {
      const res = await fetch("/api/enhance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: chapter.title,
          text: chapter.text,
          lang: lesson.lang,
        }),
      });
      const data = (await res.json()) as { scenes?: AiScene[]; error?: string };
      if (!res.ok || !data.scenes)
        throw new Error(data.error ?? "The AI request failed.");
      const chapters = lesson.chapters.map((c) =>
        c.id === chapter.id ? applyAiScenes(c, data.scenes!) : c,
      );
      onLessonChange({ ...lesson, chapters, stats: computeStats(chapters) });
      goTo(pos.c, 0);
      setAi((a) => ({ ...a, busy: false }));
    } catch (e) {
      setAi((a) => ({
        ...a,
        busy: false,
        error: e instanceof Error ? e.message : "The AI request failed.",
      }));
    }
  };

  const words = text.split(/\s+/).filter(Boolean).length || 1;
  const sceneProgress =
    playing || beat > 0
      ? (beat + Math.min(1, wordIndex / words)) / scene.narration.length
      : 0;
  const meta = SCENE_META[scene.kind];
  const isLast =
    pos.c === lesson.chapters.length - 1 && pos.s === chapter.scenes.length - 1;
  const isFirst = pos.c === 0 && pos.s === 0 && beat === 0;

  return (
    <div className="mx-auto grid w-full max-w-[1500px] gap-5 px-4 pb-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-6">
      <ChapterNav
        lesson={lesson}
        current={pos}
        visited={visited}
        onSelect={goTo}
      />

      <div className="min-w-0">
        <div className="mx-auto w-full sm:max-w-[max(560px,calc((100vh-250px)*16/9))]">
          <div ref={stageRef} className="rounded-3xl">
            <Stage
              lesson={lesson}
              scene={scene}
              chapterNumber={chapter.number}
              beat={beat}
              shown={playing ? beat : started ? 99 : 0}
              playing={playing}
              started={started}
              wordIndex={wordIndex}
              subtitles={subtitles}
              onStart={toggle}
              onToggle={toggle}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-white p-3 shadow-sm sm:p-4">
            {/* Timeline: one segment per scene in this chapter */}
            <div
              className="flex items-center gap-1"
              role="group"
              aria-label="Chapter timeline"
            >
              {chapter.scenes.map((s, i) => {
                const fill = i < pos.s ? 1 : i === pos.s ? sceneProgress : 0;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => goTo(pos.c, i)}
                    title={`${SCENE_META[s.kind].label}: ${s.title}`}
                    aria-label={`Scene ${i + 1}: ${SCENE_META[s.kind].label}`}
                    aria-current={i === pos.s}
                    className="group relative h-5 min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  >
                    <span className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-line transition-all group-hover:h-2.5">
                      <span
                        className="block h-full rounded-full bg-brand transition-[width] duration-200"
                        style={{ width: `${fill * 100}%` }}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
              <div className="flex items-center gap-1.5">
                <IconButton
                  label="Previous scene"
                  onClick={() => step(-1)}
                  disabled={isFirst}
                >
                  <SkipBack className="size-4.5 fill-current" />
                </IconButton>
                <motion.button
                  type="button"
                  onClick={toggle}
                  whileTap={{ scale: 0.92 }}
                  aria-label={playing ? "Pause" : "Play"}
                  className="grid size-12 place-items-center rounded-full bg-brand text-white shadow-lg shadow-brand/40 transition-colors hover:bg-brand-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {playing ? (
                    <Pause className="size-5 fill-current" />
                  ) : (
                    <Play className="size-5 translate-x-0.5 fill-current" />
                  )}
                </motion.button>
                <IconButton
                  label="Next scene"
                  onClick={() => step(1)}
                  disabled={isLast}
                >
                  <SkipForward className="size-4.5 fill-current" />
                </IconButton>
              </div>

              <div className="min-w-0 flex-1 basis-40">
                <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: meta.tone }}
                  />
                  <span dir="auto" className="truncate">
                    {scene.code ? "Command" : meta.label} ·{" "}
                    {scene.kind === "title" ? chapter.title : scene.title}
                  </span>
                </p>
                <p className="text-xs text-ink-soft">
                  Scene {pos.s + 1} of {chapter.scenes.length} · Chapter{" "}
                  {chapter.number} of {lesson.chapters.length}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <label className="sr-only" htmlFor="speed">
                  Playback speed
                </label>
                <select
                  id="speed"
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="h-9 rounded-lg border border-line bg-white px-2 text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-brand"
                >
                  {SPEEDS.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
                {(voices.length > 1 || studioOk) && (
                  <>
                    <label className="sr-only" htmlFor="voice">
                      Narrator voice
                    </label>
                    <select
                      id="voice"
                      value={studio ? STUDIO : (voice?.voiceURI ?? "")}
                      onChange={(e) => setVoiceURI(e.target.value)}
                      className="hidden h-9 max-w-36 rounded-lg border border-line bg-white px-2 text-sm text-ink focus-visible:outline-2 focus-visible:outline-brand md:block"
                    >
                      {studioOk && (
                        <option value={STUDIO}>Studio voice (AI)</option>
                      )}
                      {voices.map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                <IconButton
                  label={muted ? "Turn narration on" : "Mute narration"}
                  onClick={() => setMuted((m) => !m)}
                  active={!muted}
                >
                  {muted ? (
                    <VolumeX className="size-4.5" />
                  ) : (
                    <Volume2 className="size-4.5" />
                  )}
                </IconButton>
                <IconButton
                  label={subtitles ? "Hide subtitles" : "Show subtitles"}
                  onClick={() => setSubtitles((s) => !s)}
                  active={subtitles}
                >
                  {subtitles ? (
                    <Captions className="size-4.5" />
                  ) : (
                    <CaptionsOff className="size-4.5" />
                  )}
                </IconButton>
                <IconButton
                  label={`Show source page ${scene.page}`}
                  onClick={() => {
                    setPlaying(false);
                    setSourceOpen(true);
                  }}
                >
                  <FileText className="size-4.5" />
                </IconButton>
                {exp.busy === "video" ? (
                  <button
                    type="button"
                    onClick={() => finishVideoRef.current()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                  >
                    <Square className="size-3.5 animate-pulse fill-current" />{" "}
                    Stop &amp; save
                  </button>
                ) : exp.busy === "audio" ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    title="Cancel the audio export"
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold tabular-nums hover:bg-paper"
                  >
                    <Loader2 className="size-4 animate-spin text-brand" />{" "}
                    {exp.progress} · Cancel
                  </button>
                ) : (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setMenuOpen((o) => !o)}
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-semibold hover:bg-paper focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      <Download className="size-4" /> Export
                    </button>
                    {menuOpen && (
                      <>
                        <button
                          type="button"
                          aria-label="Close export menu"
                          className="fixed inset-0 z-30 cursor-default"
                          onClick={() => setMenuOpen(false)}
                        />
                        <div
                          role="menu"
                          className="absolute end-0 bottom-full z-40 mb-2 w-72 rounded-xl border border-line bg-white p-1.5 text-start shadow-xl"
                        >
                          <MenuItem
                            icon={<Film className="size-4" />}
                            title="Video · this chapter"
                            hint={
                              !canRecordVideo()
                                ? "Not supported in this browser"
                                : studio
                                  ? "Records the stage as it plays, with narration"
                                  : "Records the stage as it plays, without narration audio"
                            }
                            disabled={!canRecordVideo()}
                            onClick={exportVideo}
                          />
                          <MenuItem
                            icon={<Music className="size-4" />}
                            title="Audio MP3 · this chapter"
                            hint={
                              studioOk
                                ? `${chapter.scenes.reduce((n, s) => n + s.narration.length, 0)} narration lines`
                                : "Needs the studio voice (AI_GATEWAY_API_KEY)"
                            }
                            disabled={!studioOk}
                            onClick={() => exportAudio("chapter")}
                          />
                          <MenuItem
                            icon={<Music className="size-4" />}
                            title="Audio MP3 · whole lesson"
                            hint={
                              studioOk
                                ? `${lesson.chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + s.narration.length, 0), 0)} narration lines`
                                : "Needs the studio voice (AI_GATEWAY_API_KEY)"
                            }
                            disabled={!studioOk}
                            onClick={() => exportAudio("lesson")}
                          />
                        </div>
                      </>
                    )}
                  </div>
                )}
                {ai.available && !chapter.enhanced && (
                  <button
                    type="button"
                    onClick={enhance}
                    disabled={ai.busy}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
                  >
                    {ai.busy ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <WandSparkles className="size-4" />
                    )}
                    {ai.busy ? "Rewriting…" : "AI teacher"}
                  </button>
                )}
              </div>
            </div>
            {ai.error && (
              <p className="mt-2 text-sm text-red-600">{ai.error}</p>
            )}
            {exp.error && (
              <p role="alert" className="mt-2 text-sm text-red-600">
                {exp.error}
              </p>
            )}
            {exp.busy === "video" && (
              <p className="mt-2 text-sm text-ink-soft">
                Recording this chapter in real time. Keep this tab in front; it
                saves itself when the chapter ends.
              </p>
            )}
            {exp.note && !exp.busy && (
              <p role="status" className="mt-2 text-sm text-ink-soft">
                {exp.note}
              </p>
            )}
          </div>

          <p className="mt-3 hidden text-center text-xs text-ink-soft sm:block">
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans">
              Space
            </kbd>{" "}
            play / pause ·{" "}
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans">
              ←
            </kbd>{" "}
            <kbd className="rounded border border-line bg-white px-1.5 py-0.5 font-sans">
              →
            </kbd>{" "}
            previous / next scene
          </p>
        </div>
      </div>

      <AnimatePresence>
        {sourceOpen && (
          <SourcePage page={scene.page} onClose={() => setSourceOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({
  icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-start hover:bg-paper focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-50 disabled:hover:bg-transparent"
    >
      <span className="mt-0.5 text-brand">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-soft">{hint}</span>
      </span>
    </button>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`grid size-9 place-items-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-brand disabled:opacity-35 ${
        active
          ? "border-brand/30 bg-brand/10 text-brand-deep"
          : "border-line bg-white text-ink hover:bg-paper"
      }`}
    >
      {children}
    </button>
  );
}

function SourcePage({ page, onClose }: { page: number; onClose: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    renderPageImage(page, 1000)
      .then((url) => alive && (url ? setSrc(url) : setFailed(true)))
      .catch(() => alive && setFailed(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [page, onClose]);

  return (
    <motion.div
      className="fixed inset-0 z-50 grid place-items-center bg-ink/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Source page ${page}`}
    >
      <motion.div
        className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        initial={{ scale: 0.9, rotateX: 12 }}
        animate={{ scale: 1, rotateX: 0 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-sm font-semibold">From the book · page {page}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-lg hover:bg-paper"
          >
            <X className="size-4.5" />
          </button>
        </div>
        <div className="thin-scroll grid min-h-64 place-items-center overflow-auto bg-paper p-3">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={`Page ${page} of the PDF`}
              className="w-full rounded-lg shadow"
            />
          ) : failed ? (
            <p className="text-sm text-ink-soft">
              This page couldn&apos;t be rendered.
            </p>
          ) : (
            <Loader2 className="size-6 animate-spin text-brand" />
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
