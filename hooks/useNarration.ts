"use client";

import { useEffect, useRef, useState } from "react";

interface Options {
  /** Changes whenever a new beat should start from its beginning. */
  beatKey: string;
  text: string;
  playing: boolean;
  rate: number;
  muted: boolean;
  voice: SpeechSynthesisVoice | null;
  lang: string;
  onEnd: () => void;
}

const WORDS_PER_SECOND = 2.6;
const GAP_MS = 380;

/**
 * Speaks one beat of narration with the browser's speech engine and reports
 * which word is being spoken. When speech is muted or unavailable it keeps
 * the same pacing with a timer, so the lesson always plays.
 */
export function useNarration({ beatKey, text, playing, rate, muted, voice, lang, onEnd }: Options) {
  const [word, setWord] = useState({ key: beatKey, index: 0 });
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  useEffect(() => {
    if (!playing || !text) return;
    const words = text.split(/\s+/).filter(Boolean);
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    let cancelled = false;
    let gotBoundary = false;
    let started = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const t0 = performance.now();
    const setWordIndex = (index: number) => setWord({ key: beatKey, index });

    // Estimated word position; real boundary events override it when the voice provides them.
    const ticker = setInterval(() => {
      if (cancelled || gotBoundary) return;
      const est = Math.floor(((performance.now() - t0) / 1000) * WORDS_PER_SECOND * rate);
      setWordIndex(Math.min(words.length - 1, est));
    }, 120);

    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      clearInterval(ticker);
      setWordIndex(words.length);
      timers.push(setTimeout(() => onEndRef.current(), GAP_MS / rate));
    };

    const runSilently = () => {
      const ms = (words.length / (WORDS_PER_SECOND * rate)) * 1000 + 250;
      timers.push(setTimeout(finish, Math.max(700, ms - (performance.now() - t0))));
    };

    if (muted || !synth) {
      runSilently();
    } else {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rate;
      u.lang = voice?.lang ?? lang;
      if (voice) u.voice = voice;
      u.onstart = () => {
        started = true;
      };
      u.onboundary = (e) => {
        if (cancelled || e.name === "sentence") return;
        gotBoundary = true;
        const spoken = text.slice(0, e.charIndex).split(/\s+/).filter(Boolean).length;
        setWordIndex(Math.min(words.length - 1, spoken));
      };
      u.onend = finish;
      u.onerror = (e) => {
        if (cancelled || e.error === "interrupted" || e.error === "canceled") return;
        runSilently();
      };
      // Chrome drops an utterance queued in the same tick as cancel().
      synth.cancel();
      timers.push(setTimeout(() => !cancelled && synth.speak(u), 70));
      // If the engine never starts (no voices installed, blocked audio), fall back to the timer.
      timers.push(
        setTimeout(() => {
          if (cancelled || started) return;
          u.onend = null;
          u.onerror = null;
          synth.cancel();
          runSilently();
        }, 2200),
      );
    }

    return () => {
      cancelled = true;
      clearInterval(ticker);
      timers.forEach(clearTimeout);
      synth?.cancel();
    };
  }, [beatKey, text, playing, rate, muted, voice, lang]);

  return word.key === beatKey ? word.index : 0;
}

/** Installed speech voices for a language, best-sounding first. */
export function useVoices(lang: string) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => {
      const rank = (v: SpeechSynthesisVoice) =>
        (/natural|neural|premium|enhanced/i.test(v.name) ? 0 : /google|samantha|aria|jenny|daniel/i.test(v.name) ? 1 : 2) +
        (v.lang.startsWith(lang === "en" ? "en-US" : lang) ? 0 : 0.5);
      setVoices(
        synth
          .getVoices()
          .filter((v) => v.lang.toLowerCase().startsWith(lang))
          .sort((a, b) => rank(a) - rank(b)),
      );
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, [lang]);
  return voices;
}
