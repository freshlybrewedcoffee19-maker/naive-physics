"use client";
/* eslint-disable @next/next/no-img-element -- Canvas-generated data URLs cannot use Next image optimization. */

import type { PointerEvent, RefObject } from "react";
import { useRef, useState } from "react";
import styles from "./annotate.module.css";

type Roi = { x: number; y: number; width: number; height: number };
type CapturedFrame = { imageData: ImageData; timestamp: number; frameIndex: number | null; width: number; height: number };
type AnalysisResult = { frame: CapturedFrame; sourceFrameUrl: string; originalUrl: string; responseUrl: string; overlayUrl: string; score: number; roi: Roi; threshold: number };
type SlotName = "before" | "during" | "after";
type AnalysisSlots = Record<SlotName, AnalysisResult | null>;
type RgbAnalysisProps = { videoRef: RefObject<HTMLVideoElement | null>; hasSource: boolean; sourceKind: "local" | "sample" | null; episodeId: string; fps: number | null; currentTime: number };

const ANALYSIS_VERSION = "rgb_wrinkle_response_v0_1";
const DEFAULT_THRESHOLD = 48;
const IRON_001_CHECKPOINTS = [["Before", 9], ["During", 83.44], ["After", 91.75]] as const;
const EMPTY_SLOTS: AnalysisSlots = { before: null, during: null, after: null };

const clampRoi = (roi: Roi, width: number, height: number): Roi => {
  const x = Math.max(0, Math.min(Math.round(roi.x), Math.max(0, width - 1)));
  const y = Math.max(0, Math.min(Math.round(roi.y), Math.max(0, height - 1)));
  return { x, y, width: Math.max(1, Math.min(Math.round(roi.width), width - x)), height: Math.max(1, Math.min(Math.round(roi.height), height - y)) };
};

const imageDataUrl = (imageData: ImageData) => {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  canvas.getContext("2d")?.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};

const cropImageData = (imageData: ImageData, roi: Roi) => {
  const cropped = new ImageData(roi.width, roi.height);
  for (let y = 0; y < roi.height; y += 1) {
    const sourceStart = ((roi.y + y) * imageData.width + roi.x) * 4;
    cropped.data.set(imageData.data.subarray(sourceStart, sourceStart + roi.width * 4), y * roi.width * 4);
  }
  return cropped;
};

// Deterministic RGB pipeline: luminance conversion, 3×3 Sobel gradients,
// normalized magnitude thresholding, binary response, and red RGB overlay.
const analyzeFrame = (frame: CapturedFrame, requestedRoi: Roi, threshold: number): AnalysisResult => {
  const { imageData, width, height } = frame;
  const roi = clampRoi(requestedRoi, width, height);
  const source = imageData.data;
  const grayscale = new Float32Array(width * height);
  for (let pixel = 0, offset = 0; pixel < grayscale.length; pixel += 1, offset += 4) grayscale[pixel] = source[offset] * 0.299 + source[offset + 1] * 0.587 + source[offset + 2] * 0.114;

  const originalCrop = cropImageData(imageData, roi);
  const response = new ImageData(roi.width, roi.height);
  const overlay = new ImageData(new Uint8ClampedArray(originalCrop.data), roi.width, roi.height);
  for (let offset = 3; offset < response.data.length; offset += 4) response.data[offset] = 255;
  let candidates = 0;
  let evaluated = 0;

  for (let localY = 1; localY < roi.height - 1; localY += 1) {
    const y = roi.y + localY;
    for (let localX = 1; localX < roi.width - 1; localX += 1) {
      const x = roi.x + localX;
      if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1) continue;
      const top = (y - 1) * width + x;
      const middle = y * width + x;
      const bottom = (y + 1) * width + x;
      const gx = -grayscale[top - 1] + grayscale[top + 1] - 2 * grayscale[middle - 1] + 2 * grayscale[middle + 1] - grayscale[bottom - 1] + grayscale[bottom + 1];
      const gy = -grayscale[top - 1] - 2 * grayscale[top] - grayscale[top + 1] + grayscale[bottom - 1] + 2 * grayscale[bottom] + grayscale[bottom + 1];
      const magnitude = Math.min(255, Math.hypot(gx, gy) / 4);
      const targetOffset = (localY * roi.width + localX) * 4;
      evaluated += 1;
      if (magnitude >= threshold) {
        response.data[targetOffset] = 255; response.data[targetOffset + 1] = 255; response.data[targetOffset + 2] = 255;
        overlay.data[targetOffset] = 230; overlay.data[targetOffset + 1] = Math.round(overlay.data[targetOffset + 1] * 0.28); overlay.data[targetOffset + 2] = Math.round(overlay.data[targetOffset + 2] * 0.22);
        candidates += 1;
      }
    }
  }
  return { frame, sourceFrameUrl: imageDataUrl(imageData), originalUrl: imageDataUrl(originalCrop), responseUrl: imageDataUrl(response), overlayUrl: imageDataUrl(overlay), score: evaluated > 0 ? Math.min(1, Math.max(0, candidates / evaluated)) : 0, roi, threshold };
};

const captureVideoFrame = (video: HTMLVideoElement, fps: number | null): CapturedFrame | null => {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const timestamp = Math.round(video.currentTime * 1000) / 1000;
  return { imageData: context.getImageData(0, 0, canvas.width, canvas.height), timestamp, frameIndex: fps ? Math.round(timestamp * fps) : null, width: canvas.width, height: canvas.height };
};

const sameRoi = (a: Roi, b: Roi) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
const roiLabel = (roi: Roi) => `${roi.x}, ${roi.y} · ${roi.width} × ${roi.height}`;

const ResultImage = ({ label, url, provenance }: { label: string; url: string; provenance: string }) => <figure className={styles.analysisFigure}><figcaption><strong>{label}</strong><span>{provenance}</span></figcaption><img alt={label} src={url} /></figure>;

function RoiSelector({ result, onCommit }: { result: AnalysisResult; onCommit: (roi: Roi) => void }) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const draftRef = useRef<Roi | null>(null);
  const [draft, setDraft] = useState<Roi | null>(null);
  const visibleRoi = draft ?? result.roi;
  const sourcePoint = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(result.frame.width - 1, Math.round((event.clientX - rect.left) / rect.width * result.frame.width))), y: Math.max(0, Math.min(result.frame.height - 1, Math.round((event.clientY - rect.top) / rect.height * result.frame.height))) };
  };
  const updateDraft = (event: PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    const point = sourcePoint(event);
    const next = clampRoi({ x: Math.min(startRef.current.x, point.x), y: Math.min(startRef.current.y, point.y), width: Math.max(1, Math.abs(point.x - startRef.current.x)), height: Math.max(1, Math.abs(point.y - startRef.current.y)) }, result.frame.width, result.frame.height);
    draftRef.current = next; setDraft(next);
  };
  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    updateDraft(event);
    if (draftRef.current) onCommit(draftRef.current);
    startRef.current = null; draftRef.current = null; setDraft(null);
  };
  return <div aria-label="Captured RGB frame for garment ROI selection" className={styles.roiSelector} onPointerCancel={finishDrag} onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); startRef.current = sourcePoint(event); draftRef.current = { ...startRef.current, width: 1, height: 1 }; setDraft(draftRef.current); }} onPointerMove={updateDraft} onPointerUp={finishDrag} role="img"><img alt="Captured source RGB frame" draggable={false} src={result.sourceFrameUrl} /><span className={styles.roiBox} style={{ left: `${visibleRoi.x / result.frame.width * 100}%`, top: `${visibleRoi.y / result.frame.height * 100}%`, width: `${visibleRoi.width / result.frame.width * 100}%`, height: `${visibleRoi.height / result.frame.height * 100}%` }} /></div>;
}

function AnalysisSlot({ label, result }: { label: SlotName; result: AnalysisResult | null }) {
  return <section className={styles.analysisSlot}><header><strong>{label}</strong><span>{result ? "SAVED ANALYSIS" : "NOT SET"}</span></header>{result ? <><div className={styles.slotImages}><ResultImage label="RGB" provenance="sensor_captured" url={result.originalUrl} /><ResultImage label="RESPONSE" provenance="derived_from_rgb" url={result.responseUrl} /></div><dl><div><dt>Timestamp</dt><dd>{result.frame.timestamp.toFixed(3)} sec</dd></div><div><dt>Frame</dt><dd>{result.frame.frameIndex ?? "FPS REQUIRED"}</dd></div><div><dt>ROI</dt><dd>{roiLabel(result.roi)}</dd></div><div><dt>Threshold</dt><dd>{result.threshold}</dd></div><div><dt>Score</dt><dd>{result.score.toFixed(6)}</dd></div></dl></> : <p>Capture a frame, select its ROI, then assign it to this slot.</p>}</section>;
}

export function RgbAnalysis({ videoRef, hasSource, sourceKind, episodeId, fps, currentTime }: RgbAnalysisProps) {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [currentRaw, setCurrentRaw] = useState<CapturedFrame | null>(null);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [slots, setSlots] = useState<AnalysisSlots>(EMPTY_SLOTS);
  const [message, setMessage] = useState("");

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const frame = captureVideoFrame(video, fps);
    if (!frame) { setMessage("The current video frame is not ready to capture yet."); return; }
    const fullFrameRoi = { x: 0, y: 0, width: frame.width, height: frame.height };
    setCurrentRaw(frame); setCurrentResult(analyzeFrame(frame, fullFrameRoi, threshold)); setMessage("Current frame captured and analyzed locally in this browser.");
  };
  const updateCurrentRoi = (nextRoi: Roi) => { if (currentRaw) setCurrentResult(analyzeFrame(currentRaw, clampRoi(nextRoi, currentRaw.width, currentRaw.height), threshold)); };
  const updateRoiField = (field: keyof Roi, value: number) => { if (currentRaw && currentResult) updateCurrentRoi({ ...currentResult.roi, [field]: Number.isFinite(value) ? value : 0 }); };
  const updateThreshold = (value: number) => { const next = Math.max(0, Math.min(255, Math.round(value))); setThreshold(next); if (currentRaw && currentResult) setCurrentResult(analyzeFrame(currentRaw, currentResult.roi, next)); };
  const seekTo = (timestamp: number) => { const video = videoRef.current; if (!video) return; video.currentTime = Math.min(timestamp, Number.isFinite(video.duration) ? video.duration : timestamp); setMessage(`Sought to ${timestamp.toFixed(2)} sec. Capture explicitly when the frame is ready.`); };
  const assignSlot = (slot: SlotName) => { if (!currentResult) return; setSlots((current) => ({ ...current, [slot]: currentResult })); setMessage(`${slot.toUpperCase()} replaced with the current captured analysis.`); };

  const savedResults = Object.values(slots).filter((result): result is AnalysisResult => result !== null).sort((a, b) => a.frame.timestamp - b.frame.timestamp);
  const before = slots.before; const after = slots.after;
  const delta = before && after ? after.score - before.score : null;
  const roiMismatch = Boolean(before && after && !sameRoi(before.roi, after.roi));
  const frameNow = fps ? Math.round(currentTime * fps) : null;
  const isBundledIron001 = sourceKind === "sample" && episodeId === "IRON_001";

  const exportCsv = () => {
    if (!savedResults.length) return;
    const columns = ["episode_id","frame_index","timestamp_sec","roi_x","roi_y","roi_width","roi_height","analysis_type","threshold","wrinkle_response_score","source_type","algorithm_version"];
    const rows = savedResults.map((result) => [episodeId.trim(), result.frame.frameIndex ?? "", result.frame.timestamp.toFixed(3), result.roi.x, result.roi.y, result.roi.width, result.roi.height, ANALYSIS_VERSION, result.threshold, result.score.toFixed(6), "derived_from_rgb", ANALYSIS_VERSION]);
    const csv = [columns, ...rows].map((row) => row.join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${episodeId.trim() || "episode"}_rgb_analysis.csv`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  return <section className={styles.rgbWorkspace} aria-labelledby="rgb-title"><header className={styles.rgbHeader}><div><p>RGB ANALYSIS / v0.1</p><h2 id="rgb-title">Wrinkle / crease response inspection</h2><span>Deterministic RGB image-structure analysis. Derived from RGB · Experimental.</span></div><div className={styles.rgbReadout}><div><span>Current time</span><strong>{currentTime.toFixed(3)} s</strong></div><div><span>Current frame</span><strong>{frameNow ?? "FPS REQUIRED"}</strong></div><div><span>FPS</span><strong>{fps ?? "REQUIRED"}</strong></div></div></header>
    {!hasSource ? <div className={styles.rgbEmpty}>Upload or select a video to begin RGB analysis.</div> : <>
      {isBundledIron001 ? <div className={styles.checkpointActions}><span>IRON_001 verified checkpoints</span>{IRON_001_CHECKPOINTS.map(([label,timestamp]) => <button key={label} onClick={() => seekTo(timestamp)} type="button">Go to {label} <b>{timestamp.toFixed(2)} sec</b></button>)}</div> : null}
      <div className={styles.captureActions}><button onClick={capture} type="button">Capture current frame</button>{(["before","during","after"] as const).map((slot) => <button disabled={!currentResult} key={slot} onClick={() => assignSlot(slot)} type="button">Save as {slot}</button>)}{message ? <span role="status">{message}</span> : null}</div>
      {currentResult ? <><div className={styles.capturedFacts}><strong>ORIGINAL RGB</strong><span>{currentResult.frame.timestamp.toFixed(3)} s</span><span>{currentResult.frame.frameIndex === null ? "FPS REQUIRED" : `FRAME ${currentResult.frame.frameIndex}`}</span><span>{currentResult.frame.width} × {currentResult.frame.height}</span><b>source_type = sensor_captured</b></div>
        <section className={styles.roiWorkbench} aria-labelledby="roi-title"><div><p>GARMENT ROI / HUMAN ANNOTATED</p><h3 id="roi-title">Drag to select the garment region.</h3><span>Selection is recorded in source-image pixels. It is not automatic garment segmentation.</span><RoiSelector onCommit={updateCurrentRoi} result={currentResult} /></div><div className={styles.roiPanel}><div className={styles.roiInputs}>{(["x","y","width","height"] as const).map((field) => <label key={field}>ROI {field}<input min={field === "width" || field === "height" ? 1 : 0} onChange={(event) => updateRoiField(field, Number(event.target.value))} type="number" value={currentResult.roi[field]} /></label>)}<button onClick={() => updateCurrentRoi({x:0,y:0,width:currentResult.frame.width,height:currentResult.frame.height})} type="button">Reset ROI</button></div><label className={styles.thresholdControl}>Response threshold <strong>0–255</strong><input max="255" min="0" onChange={(event) => updateThreshold(Number(event.target.value))} step="1" type="number" value={threshold} /></label><p>Score = threshold-passing Sobel-response pixels ÷ valid ROI pixels. Result is clamped to 0–1.</p></div></section>
        <div className={styles.analysisGrid}><ResultImage label="ORIGINAL RGB" provenance="sensor_captured" url={currentResult.originalUrl} /><ResultImage label="WRINKLE RESPONSE" provenance="derived_from_rgb · experimental" url={currentResult.responseUrl} /><ResultImage label="OVERLAY" provenance="derived_from_rgb · experimental" url={currentResult.overlayUrl} /></div><div className={styles.scoreLedger}><span>RGB-DERIVED WRINKLE RESPONSE SCORE</span><strong>{currentResult.score.toFixed(6)}</strong><b>WRINKLE / CREASE CANDIDATES · EXPERIMENTAL</b></div></> : <p className={styles.capturePrompt}>Seek to a frame, then capture it explicitly to begin analysis.</p>}
      <section className={styles.comparison} aria-labelledby="comparison-title"><div className={styles.sectionHead}><div><p>SAVED CHECKPOINTS</p><h2 id="comparison-title">Before / during / after</h2></div><span>DERIVED FROM RGB / EXPERIMENTAL</span></div><div className={styles.slotGrid}><AnalysisSlot label="before" result={before} /><AnalysisSlot label="during" result={slots.during} /><AnalysisSlot label="after" result={after} /></div>{roiMismatch ? <div className={styles.roiWarning}><strong>ROI MISMATCH</strong><span>Comparison may not be directly comparable.</span></div> : null}<div className={styles.comparisonLedger}><div><span>Before score</span><strong>{before ? before.score.toFixed(6) : "—"}</strong></div><div><span>During score</span><strong>{slots.during ? slots.during.score.toFixed(6) : "—"}</strong></div><div><span>After score</span><strong>{after ? after.score.toFixed(6) : "—"}</strong></div><div><span>Delta · after − before</span><strong>{delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(6)}`}</strong></div><div><span>Interpretation</span><strong>{delta === null ? "SET BEFORE + AFTER" : Math.abs(delta) < 0.0005 ? "Little change in RGB response" : delta < 0 ? "RGB response decreased" : "RGB response increased"}</strong></div></div><button className={styles.exportAnalysis} disabled={!savedResults.length} onClick={exportCsv} type="button">Export RGB analysis CSV</button></section>
      <aside className={styles.analysisNote}><strong>Provenance</strong><span>SOURCE RGB · sensor_captured</span><span>GARMENT ROI · human_annotated</span><span>WRINKLE RESPONSE · derived_from_rgb</span><span>WRINKLE RESPONSE SCORE · derived_from_rgb</span><p>Algorithm: {ANALYSIS_VERSION}. Generic RGB gradients are candidates, not wrinkle ground truth, physical height, depth, 3D geometry, sensor-measured severity, or a validated quality score.</p></aside>
    </>}
  </section>;
}
