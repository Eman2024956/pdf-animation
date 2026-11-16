/**
 * Studio narration: real audio files from /api/tts, played through one shared
 * audio element that is also routed into a recordable stream. Unlike the
 * browser's built-in speech, this audio can be saved and mixed into a video.
 */

const cache = new Map<string, Promise<Blob>>();
let availability: Promise<boolean> | null = null;

export function studioAvailable(): Promise<boolean> {
  availability ??= fetch("/api/tts")
    .then((r) => r.json())
    .then((d) => Boolean(d.available))
    .catch(() => false);
  return availability;
}

/** Fetches (once) the spoken audio for a line of narration. */
export function fetchSpeech(text: string, lang: string): Promise<Blob> {
  const key = `${lang}:${text}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch("/api/tts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, lang }),
    }).then(async (res) => {
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The voice request failed.");
      return res.blob();
    });
    hit.catch(() => cache.delete(key));
    cache.set(key, hit);
  }
  return hit;
}

let element: HTMLAudioElement | null = null;
let context: AudioContext | null = null;
let recordOut: MediaStreamAudioDestinationNode | null = null;

/** The shared narration player. Call from a user gesture the first time. */
export function studioPlayer(): HTMLAudioElement {
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    try {
      context = new AudioContext();
      const source = context.createMediaElementSource(element);
      recordOut = context.createMediaStreamDestination();
      source.connect(context.destination);
      source.connect(recordOut);
    } catch {
      // Without Web Audio the element still plays; it just can't be mixed into a recording.
      context = null;
      recordOut = null;
    }
  }
  if (context?.state === "suspended") void context.resume();
  return element;
}

/** An audio track carrying the narration, for mixing into a video recording. */
export function narrationTrack(): MediaStreamTrack | null {
  studioPlayer();
  return recordOut?.stream.getAudioTracks()[0]?.clone() ?? null;
}
