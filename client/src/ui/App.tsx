import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LevelSchema, type Level, type LevelResponse } from "@sketchquest/shared";
import { mountGame } from "../game";
import "./App.css";

const MAX_IMAGE_EDGE = 1600;
const JPEG_QUALITY = 0.82;

type PreparedImage = {
  dataUrl: string;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
};

const markerLegend = [
  { color: "#303238", label: "Platforms" },
  { color: "#dc3f34", label: "Hazards" },
  { color: "#3478e5", label: "Start" },
  { color: "#2fa65a", label: "Goal" },
  { color: "#e5b91f", label: "Coins" },
  { color: "#8746c7", label: "Enemies" },
];

const asPercent = (coordinate: number) => `${coordinate / 10}%`;

function LevelOverlay({ level }: { level: Level }) {
  return (
    <div className="level-overlay" aria-hidden="true">
      {level.platforms.map((platform) => (
        <span
          className="detected-box detected-platform"
          key={platform.id}
          title={`Platform: ${platform.id}`}
          style={{
            left: asPercent(platform.x),
            top: asPercent(platform.y),
            width: asPercent(platform.w),
            height: asPercent(platform.h),
          }}
        />
      ))}
      {level.hazards.map((hazard) => (
        <span
          className="detected-box detected-hazard"
          key={hazard.id}
          title={`${hazard.type}: ${hazard.id}`}
          style={{
            left: asPercent(hazard.x),
            top: asPercent(hazard.y),
            width: asPercent(hazard.w),
            height: asPercent(hazard.h),
          }}
        />
      ))}
      <span
        className="detected-box detected-goal"
        title="Goal"
        style={{
          left: asPercent(level.goal.x),
          top: asPercent(level.goal.y),
          width: asPercent(level.goal.w),
          height: asPercent(level.goal.h),
        }}
      />
      <span
        className="detected-point detected-start"
        title="Start"
        style={{ left: asPercent(level.start.x), top: asPercent(level.start.y) }}
      >
        S
      </span>
      {level.coins.map((coin) => (
        <span
          className="detected-point detected-coin"
          key={coin.id}
          title={`Coin: ${coin.id}`}
          style={{ left: asPercent(coin.x), top: asPercent(coin.y) }}
        >
          C
        </span>
      ))}
      {level.enemies.map((enemy) => (
        <span
          className="detected-point detected-enemy"
          key={enemy.id}
          title={`Enemy: ${enemy.id}`}
          style={{ left: asPercent(enemy.x), top: asPercent(enemy.y) }}
        >
          E
        </span>
      ))}
    </div>
  );
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That image could not be opened. Try a JPG or PNG instead."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The browser could not prepare this image."))),
      "image/jpeg",
      quality,
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("The browser could not read this image."));
    reader.readAsDataURL(blob);
  });
}

async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const source = await loadImage(file);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(source.naturalWidth, source.naturalHeight));
  const width = Math.max(1, Math.round(source.naturalWidth * scale));
  const height = Math.max(1, Math.round(source.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is not supported in this browser.");

  // A white base keeps transparent sketches readable after JPEG conversion.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  const blob = await canvasToBlob(canvas, JPEG_QUALITY);
  return {
    dataUrl: await blobToDataUrl(blob),
    fileName: file.name || "camera-sketch.jpg",
    width,
    height,
    bytes: blob.size,
  };
}

function parseLevelResponse(payload: unknown): LevelResponse {
  if (!payload || typeof payload !== "object" || !("level" in payload)) {
    throw new Error("The server response did not include a level.");
  }

  const parsed = LevelSchema.safeParse(payload.level);
  if (!parsed.success) {
    throw new Error("The server returned a level Sketchquest could not load.");
  }

  const meta = "meta" in payload ? payload.meta : undefined;
  const repairs = isRecord(meta) && typeof meta.repairs === "number" ? meta.repairs : 0;
  const fallback = isRecord(meta) && meta.fallback === true;

  return { level: parsed.data, meta: { repairs, fallback } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function App() {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const gameRef = useRef<HTMLDivElement>(null);

  const [image, setImage] = useState<PreparedImage | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (cameraOpen && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraOpen]);

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  useEffect(() => {
    if (!level || !playing || !gameRef.current) return;

    const handle = mountGame(gameRef.current);
    handle.loadLevel(level);
    return () => handle.destroy();
  }, [level, playing]);

  const closeCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOpen(false);
  };

  const selectImage = async (file?: File) => {
    if (!file) return;

    setPreparing(true);
    setError(null);
    try {
      setImage(await prepareImage(file));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The image could not be prepared.");
    } finally {
      setPreparing(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void selectImage(event.target.files?.[0]);
    // Allow choosing the same file again after an error.
    event.target.value = "";
  };

  const openCamera = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraInputRef.current?.click();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;
      setCameraOpen(true);
    } catch {
      setError("Camera access was unavailable. You can still take or upload a photo below.");
    }
  };

  const captureFrame = async () => {
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) {
      setError("The camera is still starting. Try again in a moment.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("This browser could not capture the camera frame.");
      return;
    }

    context.drawImage(video, 0, 0);
    try {
      const blob = await canvasToBlob(canvas, 0.9);
      const file = new File([blob], "camera-sketch.jpg", { type: "image/jpeg" });
      closeCamera();
      await selectImage(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The photo could not be captured.");
    }
  };

  const createLevel = async () => {
    if (!image || submitting) return;

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: image.dataUrl }),
      });

      if (!response.ok) {
        throw new Error(`The level service returned ${response.status}. Please try again.`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new Error("The level service returned an unreadable response. Please try again.");
      }

      const result = parseLevelResponse(payload);
      setLevel(result.level);
      setPlaying(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Sketchquest could not build this level. Please try another photo.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const scanAnother = () => {
    setPlaying(false);
    setLevel(null);
    setImage(null);
    setError(null);
  };

  if (level && playing) {
    return (
      <main className="game-screen">
        <header className="game-toolbar">
          <div>
            <span className="eyebrow">Now playing</span>
            <h1>{level.name}</h1>
          </div>
          <button className="button button-secondary" type="button" onClick={scanAnother}>
            Scan another sketch
          </button>
        </header>
        <div className="game-stage" ref={gameRef} aria-label={`${level.name} game`} />
      </main>
    );
  }

  if (level && image) {
    const detectedObjects = [
      { color: "#303238", label: "Platforms", count: level.platforms.length },
      { color: "#dc3f34", label: "Hazards", count: level.hazards.length },
      { color: "#3478e5", label: "Start", count: 1 },
      { color: "#2fa65a", label: "Goal", count: 1 },
      { color: "#e5b91f", label: "Coins", count: level.coins.length },
      { color: "#8746c7", label: "Enemies", count: level.enemies.length },
    ];

    return (
      <main className="review-page">
        <header className="review-intro">
          <span className="eyebrow">Analysis complete</span>
          <h1>What Gemini saw</h1>
          <p>Check the detected objects, then play the generated level or scan your drawing again.</p>
        </header>

        <section className="review-layout">
          <div className="review-card">
            <div
              className="analysis-stage"
              style={{ aspectRatio: `${image.width} / ${image.height}` }}
              aria-label="Uploaded sketch with detected level objects overlaid"
            >
              <img src={image.dataUrl} alt="Uploaded level sketch" />
              <LevelOverlay level={level} />
            </div>
            <p className="analysis-note">Detection boxes are approximate and use the level coordinates returned by the server.</p>
            <div className="review-actions">
              <button className="button button-primary" type="button" onClick={() => setPlaying(true)}>
                Play level
              </button>
              <button className="button button-secondary" type="button" onClick={scanAnother}>
                Rescan
              </button>
            </div>
          </div>

          <aside className="review-summary">
            <span className="eyebrow">Generated level</span>
            <h2>{level.name}</h2>
            <p>{level.intro}</p>
            <h3>Detected objects</h3>
            <ul>
              {detectedObjects.map((item) => (
                <li key={item.label}>
                  <span className="marker-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                  <span>{item.label}</span>
                  <strong>{item.count}</strong>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="capture-page">
      <section className="capture-intro">
        <span className="eyebrow">Sketchquest</span>
        <h1>Turn your drawing into a level.</h1>
        <p>Frame the whole page in good light, then snap a photo or choose one you already took.</p>
      </section>

      <section className="capture-layout" aria-busy={preparing || submitting}>
        <div className="capture-card">
          <div className="preview-frame">
            {cameraOpen ? (
              <video ref={videoRef} autoPlay playsInline muted aria-label="Live camera preview" />
            ) : image ? (
              <img src={image.dataUrl} alt="Sketch ready to upload" />
            ) : (
              <div className="preview-empty">
                <span className="preview-icon" aria-hidden="true">✦</span>
                <strong>Place your sketch inside the frame</strong>
                <span>Keep all edges of the page visible</span>
              </div>
            )}
            <span className="corner corner-tl" aria-hidden="true" />
            <span className="corner corner-tr" aria-hidden="true" />
            <span className="corner corner-bl" aria-hidden="true" />
            <span className="corner corner-br" aria-hidden="true" />
            {(preparing || submitting) && (
              <div className="loading-cover" role="status">
                <span className="spinner" aria-hidden="true" />
                <strong>{preparing ? "Preparing photo…" : "Reading your sketch…"}</strong>
                {submitting && <span>Gemini is turning marker lines into a playable world.</span>}
              </div>
            )}
          </div>

          {image && !cameraOpen && (
            <p className="image-meta">
              {image.fileName} · {image.width} × {image.height} · {Math.max(1, Math.round(image.bytes / 1024))} KB
            </p>
          )}

          {error && (
            <div className="error-message" role="alert">
              <strong>We hit a snag.</strong>
              <span>{error}</span>
            </div>
          )}

          <div className="capture-actions">
            {cameraOpen ? (
              <>
                <button className="button button-primary" type="button" onClick={() => void captureFrame()}>
                  Take photo
                </button>
                <button className="button button-secondary" type="button" onClick={closeCamera}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button className="button button-primary" type="button" onClick={() => void openCamera()} disabled={preparing || submitting}>
                  Use camera
                </button>
                <button className="button button-secondary" type="button" onClick={() => uploadInputRef.current?.click()} disabled={preparing || submitting}>
                  Upload image
                </button>
              </>
            )}
          </div>

          {!cameraOpen && (
            <>
              <button
                className="button button-build"
                type="button"
                disabled={!image || preparing || submitting}
                onClick={() => void createLevel()}
              >
                {submitting ? "Building level…" : "Build my level"}
              </button>
              <button className="mobile-capture-link" type="button" onClick={() => cameraInputRef.current?.click()} disabled={preparing || submitting}>
                Camera app not opening? Take a photo instead
              </button>
            </>
          )}

          <input ref={uploadInputRef} className="visually-hidden" type="file" accept="image/*" onChange={handleFileChange} />
          <input ref={cameraInputRef} className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
        </div>

        <aside className="legend-card">
          <h2>Marker legend</h2>
          <p>Use bold, solid colors and leave a little space between objects.</p>
          <ul>
            {markerLegend.map((item) => (
              <li key={item.label}>
                <span className="marker-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>
          <p className="legend-tip"><strong>Tip:</strong> A flat, overhead photo works best.</p>
        </aside>
      </section>
    </main>
  );
}
