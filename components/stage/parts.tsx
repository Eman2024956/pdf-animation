"use client";

import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Fragment, useMemo } from "react";
import { escapeRegExp } from "@/lib/lesson/text";

/** Renders text with the lesson's key terms swept by an animated highlighter. */
export function Highlight({ text, keywords }: { text: string; keywords: string[] }) {
  const parts = useMemo(() => {
    const kws = keywords.filter((k) => k.length > 3).slice(0, 8);
    if (!kws.length) return [text];
    const re = new RegExp(`(?<![\\p{L}])(${kws.map(escapeRegExp).join("|")})[\\p{L}]{0,3}`, "giu");
    const out: (string | { hit: string })[] = [];
    const seen = new Set<string>();
    let last = 0;
    for (const m of text.matchAll(re)) {
      const key = m[1].toLowerCase();
      if (seen.has(key)) continue; // highlight each term once per line
      seen.add(key);
      out.push(text.slice(last, m.index), { hit: m[0] });
      last = m.index + m[0].length;
    }
    out.push(text.slice(last));
    return out;
  }, [text, keywords]);

  return (
    <>
      {parts.map((p, i) =>
        typeof p === "string" ? (
          <Fragment key={i}>{p}</Fragment>
        ) : (
          <mark key={i} className="hl font-semibold text-white">
            {p.hit}
          </mark>
        ),
      )}
    </>
  );
}

export function Eyebrow({ icon: Icon, label, tone }: { icon: LucideIcon; label: string; tone: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="st-small inline-flex max-w-full items-center gap-[0.6em] rounded-full border border-white/15 bg-white/10 px-[1em] py-[0.45em] font-semibold tracking-wide text-white/90 uppercase backdrop-blur"
    >
      <span className="grid size-[1.9em] shrink-0 place-items-center rounded-full" style={{ background: tone }}>
        <Icon className="size-[1.1em] text-stage" strokeWidth={2.6} />
      </span>
      <span className="truncate">{label}</span>
    </motion.div>
  );
}

/** A slowly turning 3D ring sculpture used as the scene illustration. */
export function Orbit3D({ icon: Icon, tone, pulse }: { icon: LucideIcon; tone: string; pulse: number }) {
  const rings = [
    { rx: 68, ry: 0, dur: 14, size: "100%" },
    { rx: 68, ry: 60, dur: 18, size: "82%" },
    { rx: 68, ry: -60, dur: 22, size: "64%" },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[30cqw]" style={{ perspective: 900 }}>
      {rings.map((r, i) => (
        <motion.div
          key={i}
          className="preserve-3d absolute inset-0 m-auto rounded-full border-[0.22cqw]"
          style={{ width: r.size, height: r.size, borderColor: i === 0 ? tone : "rgba(255,255,255,0.28)" }}
          initial={{ rotateX: r.rx, rotateY: r.ry, rotateZ: 0, opacity: 0, scale: 0.6 }}
          animate={{ rotateX: r.rx, rotateY: r.ry, rotateZ: 360, opacity: 1, scale: 1 }}
          transition={{
            rotateZ: { duration: r.dur, repeat: Infinity, ease: "linear" },
            opacity: { duration: 0.6, delay: i * 0.12 },
            scale: { type: "spring", stiffness: 120, damping: 14, delay: i * 0.12 },
          }}
        >
          <span
            className="absolute top-1/2 -left-[0.7cqw] size-[1.4cqw] -translate-y-1/2 rounded-full"
            style={{ background: i === 0 ? "#fff" : tone, boxShadow: `0 0 1.6cqw ${tone}` }}
          />
        </motion.div>
      ))}
      <motion.div
        key={pulse}
        className="absolute inset-0 m-auto grid size-[38%] place-items-center rounded-full"
        style={{ background: `radial-gradient(circle at 35% 30%, #fff, ${tone} 55%, transparent 100%)`, boxShadow: `0 0 6cqw ${tone}` }}
        initial={{ scale: 0.8 }}
        animate={{ scale: [0.8, 1.12, 1] }}
        transition={{ duration: 0.7 }}
      >
        <Icon className="size-1/2 text-stage" strokeWidth={2.2} />
      </motion.div>
    </div>
  );
}

/** The narrator character. Its mouth moves while it speaks. */
export function Teacher({ speaking }: { speaking: boolean }) {
  return (
    <motion.svg
      viewBox="0 0 80 80"
      className="size-[clamp(40px,6.4cqw,76px)] shrink-0 drop-shadow-[0_6px_18px_rgba(91,75,255,0.55)]"
      animate={{ y: speaking ? [0, -3, 0] : 0 }}
      transition={{ duration: 1.6, repeat: speaking ? Infinity : 0, ease: "easeInOut" }}
      aria-hidden
    >
      <defs>
        <linearGradient id="tch" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8f84ff" />
          <stop offset="1" stopColor="#5b4bff" />
        </linearGradient>
      </defs>
      <line x1="40" y1="14" x2="40" y2="6" stroke="#ffb62e" strokeWidth="3" strokeLinecap="round" />
      <motion.circle cx="40" cy="5" r="4" fill="#ffb62e" animate={{ scale: speaking ? [1, 1.35, 1] : 1 }} transition={{ duration: 0.8, repeat: Infinity }} />
      <rect x="10" y="14" width="60" height="54" rx="22" fill="url(#tch)" />
      <rect x="17" y="24" width="46" height="30" rx="14" fill="#0e0c2c" />
      {[30, 50].map((cx) => (
        <motion.ellipse
          key={cx}
          cx={cx}
          cy="36"
          rx="4.2"
          ry="5"
          fill="#7df5d3"
          style={{ transformOrigin: `${cx}px 36px` }}
          animate={{ scaleY: [1, 1, 0.1, 1, 1] }}
          transition={{ duration: 4, times: [0, 0.46, 0.5, 0.54, 1], repeat: Infinity }}
        />
      ))}
      <motion.rect
        x="34"
        width="12"
        rx="2.5"
        fill="#fff"
        initial={false}
        animate={speaking ? { height: [2.5, 7, 3.5, 6, 2.5], y: [46, 43.5, 45.5, 44, 46] } : { height: 2.5, y: 46 }}
        transition={{ duration: 0.55, repeat: speaking ? Infinity : 0 }}
      />
      <circle cx="12" cy="42" r="4" fill="#ff6b9d" />
      <circle cx="68" cy="42" r="4" fill="#ff6b9d" />
    </motion.svg>
  );
}

export function Subtitles({ text, wordIndex: spoken, dir }: { text: string; wordIndex: number; dir: "ltr" | "rtl" }) {
  const all = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  // Long beats are shown a caption-sized chunk at a time.
  const CHUNK = 13;
  const chunk = Math.floor(Math.min(spoken, Math.max(0, all.length - 1)) / CHUNK);
  const words = all.slice(chunk * CHUNK, chunk * CHUNK + CHUNK);
  const wordIndex = spoken - chunk * CHUNK;
  return (
    <motion.p
      key={`${text}-${chunk}`}
      dir={/[A-Za-z]/.test(text) && !/[\u0600-\u06FF]/.test(text) ? "ltr" : dir}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="st-body max-h-[3.1em] overflow-hidden rounded-2xl rounded-bl-md bg-black/45 px-[1em] py-[0.5em] leading-[1.3] text-white/55 backdrop-blur-md"
      style={{ fontSize: "clamp(11.5px, 1.55cqw, 19px)" }}
    >
      {words.map((w, i) => (
        <span key={i} className={i < wordIndex ? "text-white" : i === wordIndex ? "text-sun" : undefined}>
          {w}{" "}
        </span>
      ))}
    </motion.p>
  );
}
