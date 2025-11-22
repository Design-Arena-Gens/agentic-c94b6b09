"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Scene = {
  title: string;
  body?: string;
};

const CANVAS_WIDTH = 1280;
const CANVAS_HEIGHT = 720;
const FPS = 30;

const DEFAULT_SCRIPT = [
  "Welcome to Lumina Studio|Design captivating clips in seconds.",
  "Type your message|Choose colors, fonts, and layout effortlessly.",
  "Export instantly|Perfect for promos, teasers, and social posts.",
].join("\n");

const MIME_PREFERENCE = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm;codecs=h264",
  "video/webm",
];

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [sceneDuration, setSceneDuration] = useState(4);
  const [primaryColor, setPrimaryColor] = useState("#0f172a");
  const [accentColor, setAccentColor] = useState("#38bdf8");
  const [backgroundStart, setBackgroundStart] = useState("#f1f5f9");
  const [backgroundEnd, setBackgroundEnd] = useState("#dbeafe");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const isClient = typeof window !== "undefined";

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const scenes = useMemo<Scene[]>(() => {
    return script
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [title, body] = line.split("|").map((segment) => segment.trim());
        return { title, body };
      });
  }, [script]);

  const codecLabel = useMemo(() => {
    if (!isClient || typeof window === "undefined") {
      return "Detecting...";
    }
    if (!("MediaRecorder" in window)) {
      return "Unavailable";
    }
    const candidate = MIME_PREFERENCE.find((option) => MediaRecorder.isTypeSupported(option));
    if (!candidate) {
      return "Unavailable";
    }
    if (candidate.includes("vp9")) {
      return "WebM / VP9";
    }
    if (candidate.includes("vp8")) {
      return "WebM / VP8";
    }
    if (candidate.includes("h264")) {
      return "WebM / H264";
    }
    return "WebM";
  }, [isClient]);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const gradient = context.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    gradient.addColorStop(0, backgroundStart);
    gradient.addColorStop(1, backgroundEnd);
    context.fillStyle = gradient;
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }, [backgroundEnd, backgroundStart]);

  useEffect(() => {
    resetCanvas();
  }, [resetCanvas]);

  const teardownRecording = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.stop();
    }
    recorderRef.current = null;
  }, []);

  const drawBackground = useCallback(
    (context: CanvasRenderingContext2D, progress: number) => {
      const angle = progress * Math.PI * 2;
      const offsetX = Math.cos(angle) * 120;
      const offsetY = Math.sin(angle) * 120;

      const gradient = context.createLinearGradient(
        offsetX,
        offsetY,
        CANVAS_WIDTH - offsetX,
        CANVAS_HEIGHT - offsetY,
      );
      gradient.addColorStop(0, backgroundStart);
      gradient.addColorStop(1, backgroundEnd);
      context.fillStyle = gradient;
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const blobCount = 5;
      for (let index = 0; index < blobCount; index += 1) {
        const blobProgress = (progress * (index + 1) * 0.7 + index * 0.13) % 1;
        const direction = index % 2 === 0 ? 1 : -1;
        const blobX = CANVAS_WIDTH * (0.15 + 0.7 * blobProgress);
        const blobY = CANVAS_HEIGHT * (0.25 + 0.5 * (1 - blobProgress));
        const radius = 180 + Math.sin(progress * Math.PI * 2 + index) * 60;
        const gradientBlob = context.createRadialGradient(
          blobX + direction * 40,
          blobY + direction * 40,
          0,
          blobX,
          blobY,
          radius,
        );
        const baseColor = index % 2 === 0 ? accentColor : primaryColor;
        gradientBlob.addColorStop(0, `${baseColor}30`);
        gradientBlob.addColorStop(1, `${baseColor}00`);
        context.fillStyle = gradientBlob;
        context.beginPath();
        context.arc(blobX, blobY, radius, 0, Math.PI * 2);
        context.fill();
      }
    },
    [accentColor, backgroundEnd, backgroundStart, primaryColor],
  );

  const drawScene = useCallback(
    (
      context: CanvasRenderingContext2D,
      scene: Scene,
      opacity: number,
      motionOffset: number,
    ) => {
      context.save();
      context.globalAlpha = opacity;

      context.fillStyle = primaryColor;
      context.textAlign = "center";
      context.textBaseline = "middle";

      context.font = "700 72px 'Inter', 'Segoe UI', sans-serif";
      wrapText(context, scene.title, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 80 + motionOffset, 920);

      if (scene.body) {
        context.fillStyle = accentColor;
        context.font = "500 42px 'Inter', 'Segoe UI', sans-serif";
        wrapText(
          context,
          scene.body,
          CANVAS_WIDTH / 2,
          CANVAS_HEIGHT / 2 + 60 + motionOffset,
          900,
        );
      }

      context.restore();
    },
    [accentColor, primaryColor],
  );

  const handleGenerate = async () => {
    if (!isClient) {
      return;
    }
    if (!("MediaRecorder" in window)) {
      setRenderError("MediaRecorder is not supported in this browser.");
      return;
    }
    if (!canvasRef.current) {
      setRenderError("Canvas unavailable.");
      return;
    }
    if (scenes.length === 0) {
      setRenderError("Add at least one scene to generate a video.");
      return;
    }

    teardownRecording();
    setRenderError(null);
    setIsRendering(true);

    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    if (!context) {
      setRenderError("Could not access the drawing context.");
      setIsRendering(false);
      return;
    }
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const mimeType = MIME_PREFERENCE.find((candidate) =>
      MediaRecorder.isTypeSupported(candidate),
    );
    if (!mimeType) {
      setRenderError("No supported video codecs found for this browser.");
      setIsRendering(false);
      return;
    }

    const stream = canvas.captureStream(FPS);
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 6_000_000,
    });
    recorderRef.current = recorder;

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data?.size) {
        chunks.push(event.data);
      }
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      setVideoUrl((prev) => {
        if (prev) {
          URL.revokeObjectURL(prev);
        }
        return url;
      });
      setIsRendering(false);
    };

    const framesPerScene = Math.max(1, Math.round(sceneDuration * FPS));
    const totalFrames = framesPerScene * scenes.length;
    let currentFrame = 0;

    const renderFrame = () => {
      if (!context) {
        return;
      }

      const overallProgress = currentFrame / totalFrames;
      drawBackground(context, overallProgress);

      const sceneIndex = Math.min(
        scenes.length - 1,
        Math.floor(currentFrame / framesPerScene),
      );
      const scene = scenes[sceneIndex];
      const frameWithinScene = currentFrame % framesPerScene;
      const fadeSpan = Math.max(6, Math.floor(framesPerScene / 6));

      let opacity = 1;
      if (frameWithinScene < fadeSpan) {
        opacity = frameWithinScene / fadeSpan;
      } else if (frameWithinScene > framesPerScene - fadeSpan) {
        opacity = Math.max(0, (framesPerScene - frameWithinScene) / fadeSpan);
      }

      const motionOffset = Math.sin((overallProgress + sceneIndex * 0.1) * Math.PI * 2) * 18;
      drawScene(context, scene, opacity, motionOffset);

      const timelineWidth = CANVAS_WIDTH * 0.6;
      const timelineHeight = 12;
      const timelineX = (CANVAS_WIDTH - timelineWidth) / 2;
      const timelineY = CANVAS_HEIGHT - 80;

      context.save();
      context.globalAlpha = 0.35;
      context.fillStyle = "#0f172a";
      context.fillRect(timelineX, timelineY, timelineWidth, timelineHeight);
      context.restore();

      context.save();
      context.globalAlpha = 0.85;
      context.fillStyle = accentColor;
      context.fillRect(
        timelineX,
        timelineY,
        timelineWidth * (currentFrame / totalFrames),
        timelineHeight,
      );
      context.restore();

      context.save();
      context.globalAlpha = 0.6;
      context.fillStyle = primaryColor;
      context.font = "500 28px 'Inter', 'Segoe UI', sans-serif";
      context.textAlign = "center";
      context.fillText(
        `Scene ${sceneIndex + 1} - ${scene.title}`,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT - 110,
      );
      context.restore();

      currentFrame += 1;
      if (currentFrame <= totalFrames) {
        rafRef.current = requestAnimationFrame(renderFrame);
      } else {
        rafRef.current = null;
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }
    };

    recorder.start();
    renderFrame();
  };

  const handleDownload = () => {
    if (!videoUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = videoUrl;
    link.download = "lumina-studio.webm";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-50">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(37,99,235,0.18),_transparent_50%)]" />

      <header className="border-b border-white/10 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-400">Lumina Studio</p>
            <h1 className="mt-3 text-3xl font-semibold md:text-4xl">
              Craft share-ready videos straight from your copy.
            </h1>
            <p className="mt-3 max-w-2xl text-sm text-slate-300 md:text-base">
              Paste your script, tune the palette, and instantly render a dynamic social clip. No
              timelines, no plug-ins, just expressive video, exported entirely in the browser.
            </p>
          </div>
          <div className="grid gap-2 rounded-2xl border border-white/10 bg-slate-900 px-5 py-4 text-xs text-slate-300 shadow-2xl shadow-sky-900/20">
            <span className="font-semibold text-slate-100">Workflow</span>
            <span>1. Write your scenes</span>
            <span>2. Generate the clip</span>
            <span>3. Preview or download instantly</span>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10 lg:grid lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-10">
        <section className="space-y-8 rounded-3xl border border-white/10 bg-slate-950/80 p-6 shadow-xl shadow-sky-950/15">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Scene Builder</h2>
            <p className="mt-2 text-sm text-slate-400">
              Use <code className="rounded bg-slate-900 px-1 py-0.5 text-[0.75rem]">|</code> to
              split headline and body. Each new line becomes its own animated scene.
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-200">
              Script
              <textarea
                className="mt-2 h-52 w-full rounded-2xl border border-white/5 bg-slate-900/50 px-4 py-3 font-mono text-sm text-slate-200 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
                value={script}
                onChange={(event) => setScript(event.target.value)}
                placeholder="Discover the product|Add a supporting sub-headline"
              />
            </label>
            <div className="flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="rounded-full border border-white/10 px-3 py-1">
                {scenes.length} scenes
              </span>
              <span className="rounded-full border border-white/10 px-3 py-1">
                {sceneDuration} s each
              </span>
              <span className="rounded-full border border-white/10 px-3 py-1">
                {(sceneDuration * scenes.length).toFixed(1)} s total
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-200">
              Scene duration (seconds)
              <input
                type="number"
                min={2}
                max={12}
                step={0.5}
                value={sceneDuration}
                onChange={(event) => setSceneDuration(Number(event.target.value) || 0)}
                className="mt-2 w-full rounded-2xl border border-white/5 bg-slate-900/50 px-4 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/40"
              />
            </label>

            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Headline color
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(event) => setPrimaryColor(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-900"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Accent color
                <input
                  type="color"
                  value={accentColor}
                  onChange={(event) => setAccentColor(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-900"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Background start
                <input
                  type="color"
                  value={backgroundStart}
                  onChange={(event) => setBackgroundStart(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-900"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-200">
                Background end
                <input
                  type="color"
                  value={backgroundEnd}
                  onChange={(event) => setBackgroundEnd(event.target.value)}
                  className="h-11 w-full cursor-pointer rounded-2xl border border-white/10 bg-slate-900"
                />
              </label>
            </div>
          </div>

          <button
            type="button"
            onClick={handleGenerate}
            disabled={isRendering || scenes.length === 0}
            className="group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-2xl bg-sky-500 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            <span
              className="absolute inset-0 -translate-y-full bg-white/20 transition group-hover:translate-y-0"
              aria-hidden="true"
            />
            {isRendering ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
                Rendering...
              </>
            ) : (
              <>Generate video</>
            )}
          </button>

          {renderError ? <p className="text-sm text-rose-400">{renderError}</p> : null}
        </section>

        <section className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6 shadow-2xl shadow-sky-950/25">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Live Canvas</h2>
              <p className="mt-1 text-sm text-slate-400">
                Preview animates with your latest settings. Export to capture the full sequence.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!videoUrl || isRendering}
              className="rounded-full border border-sky-500/40 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-sky-200 transition hover:border-sky-400 hover:text-white disabled:cursor-not-allowed disabled:border-white/10 disabled:text-slate-500"
            >
              Download
            </button>
          </div>

          <div className="relative aspect-video w-full overflow-hidden rounded-3xl border border-white/10 bg-slate-900">
            <canvas
              ref={canvasRef}
              width={CANVAS_WIDTH}
              height={CANVAS_HEIGHT}
              className="h-full w-full object-cover"
            />
            {!isClient ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                Initializing canvas...
              </div>
            ) : null}
            {isRendering ? (
              <div className="pointer-events-none absolute inset-0 bg-slate-950/40">
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900/80 px-4 py-1 text-xs font-medium text-slate-200">
                  Rendering scenes...
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-4 rounded-2xl border border-white/5 bg-slate-900/60 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">
              Scene Breakdown
            </h3>
            <ol className="space-y-3 text-sm text-slate-300">
              {scenes.map((scene, index) => (
                <li
                  key={`${scene.title}-${index}`}
                  className="rounded-xl border border-white/10 bg-slate-900/50 px-4 py-3"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">
                    Scene {index + 1}
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-100">{scene.title}</p>
                  {scene.body ? (
                    <p className="mt-1 text-sm text-slate-400">{scene.body}</p>
                  ) : null}
                </li>
              ))}
              {scenes.length === 0 ? (
                <li className="rounded-xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-slate-500">
                  Add scenes with the builder to populate your storyboard.
                </li>
              ) : null}
            </ol>
          </div>

          <div className="grid gap-4 rounded-2xl border border-white/5 bg-slate-900/60 p-4 text-xs text-slate-300 md:grid-cols-3">
            <div>
              <p className="font-semibold text-slate-200">Resolution</p>
              <p className="mt-1">1280 x 720 at 30fps</p>
            </div>
            <div>
              <p className="font-semibold text-slate-200">Codec</p>
              <p className="mt-1">{codecLabel}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-200">Best For</p>
              <p className="mt-1">Social teasers, launch previews, hero loops</p>
            </div>
          </div>

          {videoUrl ? (
            <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-200">
              <p className="font-semibold">Render complete</p>
              <video controls src={videoUrl} className="w-full rounded-xl border border-white/10" />
              <p>Your video is ready. Tap download above or share the WebM anywhere.</p>
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function wrapText(
  context: CanvasRenderingContext2D,
  text: string,
  centerX: number,
  centerY: number,
  maxWidth: number,
) {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (context.measureText(testLine).width > maxWidth && currentLine.length > 0) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  const fontSize = Number.parseInt(context.font, 10) || 24;
  const lineHeight = fontSize * 1.26;
  const totalHeight = lineHeight * lines.length;
  let drawY = centerY - totalHeight / 2 + lineHeight / 2;

  for (const line of lines) {
    context.fillText(line, centerX, drawY);
    drawY += lineHeight;
  }
}
