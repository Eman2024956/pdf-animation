import { fetchSpeech } from "@/lib/audio/studio";

/* eslint-disable @typescript-eslint/no-explicit-any */

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const safeFileName = (s: string) =>
  s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "lesson";

/** Drops a leading ID3v2 tag so MP3 segments can be joined into one stream. */
function stripId3(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    return bytes.subarray(10 + size);
  }
  return bytes;
}

/**
 * Builds one MP3 from a list of narration lines. Lines are voiced a few at a
 * time and joined in order; MP3 is a frame stream, so segments concatenate.
 */
export async function buildMp3(
  lines: string[],
  lang: string,
  onProgress: (done: number, total: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const parts: Uint8Array[] = new Array(lines.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < lines.length) {
      const i = next++;
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const blob = await fetchSpeech(lines[i], lang);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      parts[i] = i === 0 ? bytes : stripId3(bytes);
      onProgress(++done, lines.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return new Blob(parts as BlobPart[], { type: "audio/mpeg" });
}

export interface Recording {
  /** Finishes the recording and returns the video file. */
  stop: () => Promise<Blob>;
  ext: "mp4" | "webm";
  /** True when the video is cropped to the lesson stage rather than the whole tab. */
  cropped: boolean;
  hasAudio: boolean;
}

const VIDEO_TYPES = [
  "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export const canRecordVideo = () =>
  typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia) && typeof MediaRecorder !== "undefined";

/**
 * Records the lesson stage as it plays. The browser asks the user to share
 * this tab; where supported the capture is cropped to the stage element.
 * `narration` is the studio voice track; without it the tab's own audio is
 * requested (browser speech voices are usually not capturable).
 */
export async function startRecording(
  stage: HTMLElement,
  narration: MediaStreamTrack | null,
  onEnded: () => void,
): Promise<Recording> {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: 30 },
    audio: !narration,
    preferCurrentTab: true,
    selfBrowserSurface: "include",
  } as any);
  const [video] = display.getVideoTracks();

  let cropped = false;
  const CropTarget = (window as any).CropTarget;
  if (CropTarget?.fromElement && typeof (video as any).cropTo === "function") {
    try {
      await (video as any).cropTo(await CropTarget.fromElement(stage));
      cropped = true;
    } catch {
      // The user shared a different surface; keep the uncropped capture.
    }
  }

  const audio = narration ? [narration] : display.getAudioTracks();
  const mimeType = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
  const recorder = new MediaRecorder(new MediaStream([video, ...audio]), {
    ...(mimeType ? { mimeType } : {}),
    videoBitsPerSecond: 6_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  video.addEventListener("ended", onEnded); // the user pressed the browser's "Stop sharing"
  recorder.start(1000);

  const type = recorder.mimeType || mimeType || "video/webm";
  return {
    ext: type.includes("mp4") ? "mp4" : "webm",
    cropped,
    hasAudio: audio.length > 0,
    stop: () =>
      new Promise<Blob>((resolve) => {
        const finish = () => {
          video.removeEventListener("ended", onEnded);
          display.getTracks().forEach((t) => t.stop());
          narration?.stop();
          resolve(new Blob(chunks, { type: type.split(";")[0] }));
        };
        if (recorder.state === "inactive") return finish();
        recorder.onstop = finish;
        recorder.stop();
      }),
  };
}
