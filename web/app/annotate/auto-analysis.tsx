"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob, makeCsv, makeTar } from "./analysis-export";
import { detectHandsAndPose, MEDIAPIPE_MODELS, MEDIAPIPE_VERSION, segmentFromPoint } from "./mediapipe-analysis";
import styles from "./annotate.module.css";

type Status = "not_started" | "running" | "complete" | "partial" | "failed" | "unavailable";
type SourceType = "human_annotated" | "human_verified" | "model_estimated" | "auto_tracked" | "derived_from_rgb";
type Mode = "FAST" | "FULL";
type ModuleName = "Garment segmentation" | "Semantic keypoints" | "Hand pose" | "Iron tracking" | "Optical flow" | "Slip candidates" | "RGB analysis" | "Depth estimate" | "Estimated 3D";
type PointLabel = "left_shoulder" | "right_shoulder" | "left_sleeve_tip" | "right_sleeve_tip" | "left_hem" | "right_hem" | "garment_center" | "anchor_point" | "iron_contact_point";
type SemanticRecord = { episode_id: string; frame_index: number; timestamp_sec: number; semantic_type: "keypoint" | "region"; semantic_label: PointLabel | string; x_px: number | null; y_px: number | null; source_type: SourceType; confidence: number | null; algorithm_version: string };
type SlipRecord = { episode_id: string; start_frame: number; end_frame: number; start_time_sec: number; end_time_sec: number; event_label: "slip_candidate" | "slip"; candidate_score: number; review_status: "candidate" | "accepted" | "rejected"; source_type: SourceType; algorithm_version: string; evidence: string };
type TemporalRecord = { label: string; start_time_sec: number; end_time_sec: number; source_type: "human_annotated" };
type InteractionMode = "landmark" | "garment" | "iron";
type HandRecord = { episode_id: string; frame_index: number; timestamp_sec: number; hand_index: number; handedness: string; center_x_px: number; center_y_px: number; landmarks_json: string; source_type: "model_estimated" | "auto_tracked"; algorithm_version: string };
type ToolRecord = { episode_id: string; frame_index: number; timestamp_sec: number; x_px: number; y_px: number; width_px: number; height_px: number; center_x_px: number; center_y_px: number; source_type: "human_verified" | "auto_tracked"; tracking_status: "seed" | "tracked" | "review_required"; algorithm_version: string };
type MaskState = { width: number; height: number; values: Float32Array; seedTime: number; seedX: number; seedY: number; source_type: "model_estimated" | "human_verified" };
type MaskTrack = { frame_index: number; timestamp_sec: number; offset_x_px: number; offset_y_px: number; source_type: "model_estimated" | "auto_tracked"; tracking_status: "seed" | "tracked" | "review_required" };

const MODULES: ModuleName[] = ["Garment segmentation", "Semantic keypoints", "Hand pose", "Iron tracking", "Optical flow", "Slip candidates", "RGB analysis", "Depth estimate", "Estimated 3D"];
const POINT_LABELS: PointLabel[] = ["left_shoulder", "right_shoulder", "left_sleeve_tip", "right_sleeve_tip", "left_hem", "right_hem", "garment_center", "anchor_point", "iron_contact_point"];
const SEMANTIC_COLUMNS = ["episode_id","frame_index","timestamp_sec","semantic_type","semantic_label","x_px","y_px","source_type","confidence","algorithm_version"] as const;
const SLIP_COLUMNS = ["episode_id","start_frame","end_frame","start_time_sec","end_time_sec","event_label","candidate_score","review_status","source_type","algorithm_version"] as const;
const HAND_COLUMNS = ["episode_id","frame_index","timestamp_sec","hand_index","handedness","center_x_px","center_y_px","landmarks_json","source_type","algorithm_version"] as const;
const TOOL_COLUMNS = ["episode_id","frame_index","timestamp_sec","x_px","y_px","width_px","height_px","center_x_px","center_y_px","source_type","tracking_status","algorithm_version"] as const;
const initialStatuses = () => Object.fromEntries(MODULES.map((name) => [name, "not_started"])) as Record<ModuleName, Status>;
const waitForSeek = (video: HTMLVideoElement, time: number) => new Promise<void>((resolve, reject) => {
  const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Video seek timed out.")); }, 6000);
  const cleanup = () => { window.clearTimeout(timeout); video.removeEventListener("seeked", done); video.removeEventListener("error", fail); };
  const done = () => { cleanup(); resolve(); };
  const fail = () => { cleanup(); reject(new Error("Video frame could not be decoded.")); };
  video.addEventListener("seeked", done, { once: true });
  video.addEventListener("error", fail, { once: true });
  video.currentTime = Math.max(0, Math.min(time, Math.max(0, video.duration - .01)));
});
const capturePixels = async (video: HTMLVideoElement, time: number, width = 96, height = 54) => {
  await waitForSeek(video, time);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas unavailable.");
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
};
const luma = (image: ImageData) => {
  const values = new Float32Array(image.width * image.height);
  for (let pixel = 0, index = 0; pixel < image.data.length; pixel += 4, index += 1) values[index] = image.data[pixel] * .299 + image.data[pixel + 1] * .587 + image.data[pixel + 2] * .114;
  return values;
};
const blockFlow = (first: ImageData, second: ImageData) => {
  const a = luma(first), b = luma(second), width = first.width, height = first.height, block = 6, radius = 3;
  const vectors: Array<{ x: number; y: number }> = [];
  for (let y = block; y < height - block; y += block) for (let x = block; x < width - block; x += block) {
    let best = Number.POSITIVE_INFINITY, bestX = 0, bestY = 0;
    for (let dy = -radius; dy <= radius; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) {
      let error = 0;
      for (let py = 0; py < block; py += 2) for (let px = 0; px < block; px += 2) error += Math.abs(a[(y + py) * width + x + px] - b[(y + py + dy) * width + x + px + dx]);
      if (error < best) { best = error; bestX = dx; bestY = dy; }
    }
    vectors.push({ x: bestX, y: bestY });
  }
  const meanX = vectors.reduce((sum, item) => sum + item.x, 0) / Math.max(1, vectors.length);
  const meanY = vectors.reduce((sum, item) => sum + item.y, 0) / Math.max(1, vectors.length);
  const relative = vectors.reduce((sum, item) => sum + Math.hypot(item.x - meanX, item.y - meanY), 0) / Math.max(1, vectors.length);
  return { relative, global: Math.hypot(meanX, meanY), meanX, meanY, vectorCount: vectors.length };
};
const rgbResponse = (image: ImageData) => {
  const values = luma(image), { width, height } = image; let passing = 0, considered = 0;
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const gx = values[y * width + x + 1] - values[y * width + x - 1];
    const gy = values[(y + 1) * width + x] - values[(y - 1) * width + x];
    if (Math.hypot(gx, gy) >= 48) passing += 1;
    considered += 1;
  }
  return passing / Math.max(1, considered);
};
const proposeGarmentPoints = (mask: MaskState, dimensions: { width: number; height: number }, episodeId: string, time: number, fps: number): SemanticRecord[] => {
  let minX = mask.width, minY = mask.height, maxX = -1, maxY = -1;
  for (let y = 0; y < mask.height; y += 1) for (let x = 0; x < mask.width; x += 1) if (mask.values[y * mask.width + x] > .5) {
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  if (maxX <= minX || maxY <= minY) return [];
  const sx = dimensions.width / mask.width, sy = dimensions.height / mask.height, width = maxX - minX, height = maxY - minY;
  const geometry: Array<[PointLabel, number, number]> = [
    ["left_shoulder", minX + width * .28, minY + height * .12], ["right_shoulder", minX + width * .72, minY + height * .12],
    ["left_sleeve_tip", minX + width * .08, minY + height * .30], ["right_sleeve_tip", minX + width * .92, minY + height * .30],
    ["left_hem", minX + width * .22, minY + height * .92], ["right_hem", minX + width * .78, minY + height * .92],
    ["garment_center", minX + width * .5, minY + height * .52],
  ];
  return geometry.map(([label, x, y]) => ({ episode_id: episodeId, frame_index: Math.round(time * fps), timestamp_sec: time, semantic_type: "keypoint", semantic_label: label, x_px: Math.round(x * sx), y_px: Math.round(y * sy), source_type: "model_estimated", confidence: null, algorithm_version: "mask_geometry_proposal_v0_1" }));
};
const formatStatus = (status: Status) => status.replaceAll("_", " ");

export function AutoAnalysis({ videoRef, episodeId, fps, currentTime, duration, dimensions, activeRegion, temporal }: { videoRef: RefObject<HTMLVideoElement | null>; episodeId: string; fps: number | null; currentTime: number; duration: number; dimensions: { width: number; height: number }; activeRegion: string; temporal: TemporalRecord[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<Mode>("FAST");
  const [statuses, setStatuses] = useState(initialStatuses);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("Load an episode to begin.");
  const [frameImage, setFrameImage] = useState<ImageData | null>(null);
  const [pointLabel, setPointLabel] = useState<PointLabel>("garment_center");
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("landmark");
  const [semantics, setSemantics] = useState<SemanticRecord[]>([]);
  const [hands, setHands] = useState<HandRecord[]>([]);
  const [poseSamples, setPoseSamples] = useState(0);
  const [mask, setMask] = useState<MaskState | null>(null);
  const [maskTracks, setMaskTracks] = useState<MaskTrack[]>([]);
  const [toolSeed, setToolSeed] = useState<ToolRecord | null>(null);
  const [toolTracks, setToolTracks] = useState<ToolRecord[]>([]);
  const [slips, setSlips] = useState<SlipRecord[]>([]);
  const [rgbScores, setRgbScores] = useState<Array<{ frame: number; time: number; score: number }>>([]);
  const [videoExporting, setVideoExporting] = useState(false);
  const setStatus = (name: ModuleName, status: Status) => setStatuses((current) => ({ ...current, [name]: status }));
  const activeSlips = useMemo(() => slips.filter((item) => item.review_status !== "rejected"), [slips]);

  const drawReviewFrame = useCallback((image = frameImage, records = semantics) => {
    const canvas = canvasRef.current; if (!canvas || !image) return;
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext("2d"); if (!context) return;
    context.putImageData(image, 0, 0);
    if (mask) {
      context.fillStyle = "rgba(210,43,32,.22)";
      for (let y = 0; y < image.height; y += 3) for (let x = 0; x < image.width; x += 3) {
        const mx = Math.min(mask.width - 1, Math.floor(x / image.width * mask.width));
        const my = Math.min(mask.height - 1, Math.floor(y / image.height * mask.height));
        if (mask.values[my * mask.width + mx] > .5) context.fillRect(x, y, 3, 3);
      }
    }
    context.font = "10px monospace"; context.lineWidth = 2;
    records.filter((item) => item.x_px !== null && item.y_px !== null && item.frame_index === Math.round(currentTime * (fps ?? 0))).forEach((item) => {
      const x = item.x_px! / Math.max(1, dimensions.width) * image.width, y = item.y_px! / Math.max(1, dimensions.height) * image.height;
      context.strokeStyle = item.semantic_label.includes("iron") ? "#ffcc33" : item.semantic_label.includes("anchor") ? "#d42b20" : "#f6f1e8";
      context.beginPath(); context.arc(x, y, 5, 0, Math.PI * 2); context.stroke(); context.fillStyle = context.strokeStyle; context.fillText(item.semantic_label, x + 8, y - 7);
    });
    const visibleTool = [...toolTracks, ...(toolSeed ? [toolSeed] : [])].find((item) => item.frame_index === Math.round(currentTime * (fps ?? 0)));
    if (visibleTool) { context.strokeStyle = "#ffd84d"; context.strokeRect(visibleTool.x_px / dimensions.width * image.width, visibleTool.y_px / dimensions.height * image.height, visibleTool.width_px / dimensions.width * image.width, visibleTool.height_px / dimensions.height * image.height); }
  }, [currentTime, dimensions.height, dimensions.width, fps, frameImage, mask, semantics, toolSeed, toolTracks]);
  useEffect(() => drawReviewFrame(), [drawReviewFrame]);

  const captureReviewFrame = async () => {
    const video = videoRef.current; if (!video || !dimensions.width || !dimensions.height) return;
    const canvas = document.createElement("canvas"); canvas.width = dimensions.width; canvas.height = dimensions.height;
    const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return;
    context.drawImage(video, 0, 0, dimensions.width, dimensions.height);
    const image = context.getImageData(0, 0, dimensions.width, dimensions.height);
    setFrameImage(image); requestAnimationFrame(() => drawReviewFrame(image, semantics));
  };
  const addPoint = async (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!frameImage || !episodeId || !fps) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left) / rect.width * dimensions.width), y = Math.round((event.clientY - rect.top) / rect.height * dimensions.height);
    if (interactionMode === "garment") {
      try {
        setStatus("Garment segmentation", "running"); setNotice("Loading MediaPipe and generating a mask from the garment seed…");
        const canvas = event.currentTarget;
        const generated = await segmentFromPoint(canvas, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
        const nextMask: MaskState = { ...generated, seedTime: currentTime, seedX: x, seedY: y, source_type: mask ? "human_verified" : "model_estimated" };
        setMask(nextMask); setMaskTracks([]); setStatus("Garment segmentation", "complete");
        const points = proposeGarmentPoints(nextMask, dimensions, episodeId, currentTime, fps);
        setSemantics((current) => [...current.filter((item) => !points.some((point) => point.frame_index === item.frame_index && point.semantic_label === item.semantic_label)), ...points]);
        setStatus("Semantic keypoints", points.length ? "partial" : "failed"); setNotice(`Genuine MediaPipe garment mask produced. ${points.length} geometry proposals require review.`);
      } catch (error) { setStatus("Garment segmentation", "failed"); setNotice(`Segmentation failed non-fatally: ${error instanceof Error ? error.message : "unknown error"}`); }
      return;
    }
    if (interactionMode === "iron") {
      const width = Math.max(48, Math.round(dimensions.width * .16)), height = Math.max(40, Math.round(dimensions.height * .18));
      const seed: ToolRecord = { episode_id: episodeId, frame_index: Math.round(currentTime * fps), timestamp_sec: currentTime, x_px: Math.max(0, Math.round(x - width / 2)), y_px: Math.max(0, Math.round(y - height / 2)), width_px: width, height_px: height, center_x_px: x, center_y_px: y, source_type: "human_verified", tracking_status: "seed", algorithm_version: "initialized_block_tracker_v0_1" };
      setToolSeed(seed); setToolTracks([]); setStatus("Iron tracking", "partial"); setNotice("Iron tracker initialized. Run Auto Analysis to propagate this visible region."); return;
    }
    const record: SemanticRecord = { episode_id: episodeId, frame_index: Math.round(currentTime * fps), timestamp_sec: currentTime, semantic_type: "keypoint", semantic_label: pointLabel, x_px: x, y_px: y, source_type: "human_verified", confidence: null, algorithm_version: "semantic_v0_1" };
    setSemantics((current) => [...current.filter((item) => !(item.frame_index === record.frame_index && item.semantic_label === pointLabel)), record]);
    setStatus("Semantic keypoints", "partial");
    if (pointLabel === "anchor_point") setStatus("Hand pose", "partial");
    if (pointLabel === "iron_contact_point") setStatus("Iron tracking", "partial");
  };
  const addRegion = () => {
    if (!episodeId || !fps || !["front_body","both_sleeves","back_body"].includes(activeRegion)) return;
    setSemantics((current) => [...current.filter((item) => item.semantic_type !== "region"), { episode_id: episodeId, frame_index: Math.round(currentTime * fps), timestamp_sec: currentTime, semantic_type: "region", semantic_label: activeRegion, x_px: null, y_px: null, source_type: "human_verified", confidence: null, algorithm_version: "semantic_v0_1" }]);
  };

  const runAnalysis = async () => {
    const video = videoRef.current;
    if (!video || !episodeId || !fps || !duration) { setNotice("Load a browser-readable episode with FPS before analysis."); return; }
    setRunning(true); setNotice(`${mode} analysis running. Temporal annotation remains independent.`);
    const originalTime = video.currentTime, wasPaused = video.paused;
    setStatus("Garment segmentation", "running"); setStatus("Semantic keypoints", "running"); setStatus("Hand pose", "running"); setStatus("Iron tracking", "running");
    setStatus("Optical flow", "running"); setStatus("Slip candidates", "running"); setStatus("RGB analysis", "running"); setStatus("Depth estimate", "running"); setStatus("Estimated 3D", "running");
    try {
      setStatus("Garment segmentation", mask ? "partial" : "not_started");
      setStatus("Semantic keypoints", semantics.length ? "partial" : "not_started");
      setStatus("Hand pose", "running");
      setStatus("Iron tracking", toolSeed ? "running" : "not_started");
      setStatus("Depth estimate", "unavailable"); setStatus("Estimated 3D", "unavailable");
      const count = mode === "FAST" ? 5 : 12, interval = .2;
      const times = Array.from({ length: count }, (_, index) => Math.min(Math.max(0, duration - interval - .05), (index + 1) / (count + 1) * duration));
      const nextSlips: SlipRecord[] = [], nextRgb: Array<{ frame: number; time: number; score: number }> = [], nextHands: HandRecord[] = [], nextTools: ToolRecord[] = [], nextMaskTracks: MaskTrack[] = [];
      const handFailures: string[] = [];
      let nextPoseSamples = 0, cumulativeX = 0, cumulativeY = 0;
      for (const time of times) {
        try {
          const first = await capturePixels(video, time), second = await capturePixels(video, Math.min(duration - .01, time + interval));
          const flow = blockFlow(first, second), score = Math.min(1, flow.relative / 3);
          let handEvidence = false;
          try {
            const detected = await detectHandsAndPose(video);
            if (detected.pose.landmarks.length) nextPoseSamples += 1;
            handEvidence = detected.hands.landmarks.length > 0;
            detected.hands.landmarks.forEach((landmarks, handIndex) => {
              const centerX = landmarks.reduce((sum, point) => sum + point.x, 0) / landmarks.length * dimensions.width;
              const centerY = landmarks.reduce((sum, point) => sum + point.y, 0) / landmarks.length * dimensions.height;
              nextHands.push({ episode_id: episodeId, frame_index: Math.round(time * fps), timestamp_sec: time, hand_index: handIndex, handedness: detected.hands.handedness[handIndex]?.[0]?.categoryName ?? "unknown", center_x_px: centerX, center_y_px: centerY, landmarks_json: JSON.stringify(landmarks.map((point) => ({ x_px: point.x * dimensions.width, y_px: point.y * dimensions.height, z: point.z }))), source_type: "model_estimated", algorithm_version: "mediapipe_hand_landmarker_v1" });
            });
          } catch (error) {
            handFailures.push(error instanceof Error ? error.message : String(error));
          }
          cumulativeX += flow.meanX / first.width * dimensions.width; cumulativeY += flow.meanY / first.height * dimensions.height;
          if (mask) nextMaskTracks.push({ frame_index: Math.round(time * fps), timestamp_sec: time, offset_x_px: Math.round(cumulativeX), offset_y_px: Math.round(cumulativeY), source_type: Math.abs(time - mask.seedTime) < .001 ? "model_estimated" : "auto_tracked", tracking_status: flow.relative < 2.8 ? "tracked" : "review_required" });
          if (toolSeed && time >= toolSeed.timestamp_sec) {
            const cx = toolSeed.center_x_px + cumulativeX, cy = toolSeed.center_y_px + cumulativeY;
            const inBounds = cx >= 0 && cx < dimensions.width && cy >= 0 && cy < dimensions.height;
            nextTools.push({ ...toolSeed, frame_index: Math.round(time * fps), timestamp_sec: time, x_px: Math.round(cx - toolSeed.width_px / 2), y_px: Math.round(cy - toolSeed.height_px / 2), center_x_px: Math.round(cx), center_y_px: Math.round(cy), source_type: "auto_tracked", tracking_status: inBounds && flow.relative < 2.8 ? "tracked" : "review_required" });
          }
          nextRgb.push({ frame: Math.round(time * fps), time, score: rgbResponse(first) });
          const ironEvidence = Boolean(toolSeed), garmentEvidence = Boolean(mask);
          const interactionBoost = (handEvidence ? .08 : 0) + (ironEvidence ? .08 : 0) + (garmentEvidence ? .08 : 0);
          if (flow.relative >= 1.15) nextSlips.push({ episode_id: episodeId, start_frame: Math.round(time * fps), end_frame: Math.round((time + interval) * fps), start_time_sec: time, end_time_sec: time + interval, event_label: "slip_candidate", candidate_score: Math.min(1, score + interactionBoost), review_status: "candidate", source_type: "auto_tracked", algorithm_version: "slip_candidate_interaction_evidence_v0_2", evidence: `Garment-mask=${garmentEvidence}; hand=${handEvidence}; iron-track=${ironEvidence}; local relative motion=${flow.relative.toFixed(3)} px; global translation=${flow.global.toFixed(3)} px; ${flow.vectorCount} blocks. Human verification required.` });
        } catch { /* independent sample failure */ }
      }
      const interactionPoints: SemanticRecord[] = [];
      nextHands.forEach((hand) => {
        if (temporal.some((item) => item.label === "anchor" && hand.timestamp_sec >= item.start_time_sec && hand.timestamp_sec <= item.end_time_sec)) interactionPoints.push({ episode_id: episodeId, frame_index: hand.frame_index, timestamp_sec: hand.timestamp_sec, semantic_type: "keypoint", semantic_label: "anchor_point", x_px: Math.round(hand.center_x_px), y_px: Math.round(hand.center_y_px), source_type: "model_estimated", confidence: null, algorithm_version: "hand_center_anchor_candidate_v0_1" });
      });
      if (mask) nextTools.forEach((tool) => {
        const mx = Math.max(0, Math.min(mask.width - 1, Math.floor(tool.center_x_px / dimensions.width * mask.width)));
        const my = Math.max(0, Math.min(mask.height - 1, Math.floor(tool.center_y_px / dimensions.height * mask.height)));
        if (mask.values[my * mask.width + mx] > .5) interactionPoints.push({ episode_id: episodeId, frame_index: tool.frame_index, timestamp_sec: tool.timestamp_sec, semantic_type: "keypoint", semantic_label: "iron_contact_point", x_px: tool.center_x_px, y_px: tool.center_y_px, source_type: "auto_tracked", confidence: null, algorithm_version: "mask_overlap_contact_candidate_v0_1" });
      });
      if (interactionPoints.length) setSemantics((current) => [...current.filter((item) => !interactionPoints.some((point) => point.frame_index === item.frame_index && point.semantic_label === item.semantic_label)), ...interactionPoints]);
      setRgbScores(nextRgb); setSlips(nextSlips); setHands(nextHands); setPoseSamples(nextPoseSamples); setToolTracks(nextTools); setMaskTracks(nextMaskTracks);
      setStatus("Hand pose", handFailures.length ? (nextHands.length ? "partial" : "failed") : "complete");
      setStatus("Iron tracking", toolSeed ? (nextTools.some((item) => item.tracking_status === "review_required") ? "partial" : nextTools.length ? "complete" : "failed") : "not_started");
      if (mask) setStatus("Garment segmentation", "complete");
      setStatus("Optical flow", nextRgb.length === times.length ? "complete" : nextRgb.length ? "partial" : "failed");
      setStatus("RGB analysis", nextRgb.length ? "complete" : "failed");
      setStatus("Slip candidates", nextRgb.length ? "complete" : "failed");
      setNotice(`Analysis complete: ${nextRgb.length} sampled frames, ${nextHands.length} hand detections, ${nextTools.length} tool positions, ${nextSlips.length} slip candidates.${handFailures.length ? ` Hand Pose ${nextHands.length ? "partially failed" : "failed"}: ${handFailures[0]}` : ""} No candidate is ground truth.`);
    } finally {
      try { await waitForSeek(video, originalTime); if (!wasPaused) await video.play(); } catch { /* playback restoration must not block results */ }
      setRunning(false);
    }
  };

  const reviewSlip = (index: number, review_status: "accepted" | "rejected") => setSlips((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, review_status, event_label: review_status === "accepted" ? "slip" : "slip_candidate", source_type: review_status === "accepted" ? "human_verified" : item.source_type } : item));
  const jumpTo = (time: number) => { const video = videoRef.current; if (video) video.currentTime = time; };
  const semanticCsv = () => makeCsv(SEMANTIC_COLUMNS, semantics.map((item) => [item.episode_id,item.frame_index,item.timestamp_sec.toFixed(3),item.semantic_type,item.semantic_label,item.x_px,item.y_px,item.source_type,item.confidence,item.algorithm_version]));
  const handCsv = () => makeCsv(HAND_COLUMNS, hands.map((item) => [item.episode_id,item.frame_index,item.timestamp_sec.toFixed(3),item.hand_index,item.handedness,item.center_x_px.toFixed(2),item.center_y_px.toFixed(2),item.landmarks_json,item.source_type,item.algorithm_version]));
  const toolCsv = () => makeCsv(TOOL_COLUMNS, [...(toolSeed ? [toolSeed] : []), ...toolTracks].map((item) => [item.episode_id,item.frame_index,item.timestamp_sec.toFixed(3),item.x_px,item.y_px,item.width_px,item.height_px,item.center_x_px,item.center_y_px,item.source_type,item.tracking_status,item.algorithm_version]));
  const slipCsv = () => makeCsv(SLIP_COLUMNS, slips.map((item) => [item.episode_id,item.start_frame,item.end_frame,item.start_time_sec.toFixed(3),item.end_time_sec.toFixed(3),item.event_label,item.candidate_score.toFixed(6),item.review_status,item.source_type,item.algorithm_version]));
  const provenanceJson = () => JSON.stringify({ episode_id: episodeId, workbench: "internal_experimental", generated_at: new Date().toISOString(), dependency: { name: "@mediapipe/tasks-vision", version: MEDIAPIPE_VERSION, license: "Apache-2.0" }, remote_models: MEDIAPIPE_MODELS, algorithms: { semantic: "mask_geometry_proposal_v0_1", motion: "block_flow_v0_1", hand: "mediapipe_hand_landmarker_v1", pose_support: "mediapipe_pose_landmarker_lite_v1", garment_mask: "mediapipe_magic_touch_v1", mask_propagation: "block_flow_translation_v0_1", iron: "initialized_block_tracker_v0_1", slip: "slip_candidate_interaction_evidence_v0_2", rgb: "rgb_sampled_response_v0_1" }, outputs: { hand_records: hands.length, pose_support_samples: poseSamples, mask_seeded: Boolean(mask), mask_track_records: maskTracks.length, tool_track_records: toolTracks.length }, source_types: ["human_annotated","human_verified","model_estimated","auto_tracked","derived_from_rgb"], limitations: ["RGB only","model and tracked output are not ground truth","block-flow is image motion, not calibrated physical velocity","mask propagation and iron tracking are approximate","slip candidates require human review","no sensor depth","no force or tactile sensing"] }, null, 2);
  const exportPackage = async () => {
    const files: Array<{ name: string; content: string }> = [];
    if (semantics.length) files.push({ name: `${episodeId}/semantics.csv`, content: semanticCsv() });
    if (hands.length) files.push({ name: `${episodeId}/hands.csv`, content: handCsv() });
    if (toolSeed || toolTracks.length) files.push({ name: `${episodeId}/tool_track.csv`, content: toolCsv() });
    if (slips.length) files.push({ name: `${episodeId}/slip.csv`, content: slipCsv() });
    files.push({ name: `${episodeId}/provenance.json`, content: provenanceJson() });
    const tar = await makeTar(files); downloadBlob(`${episodeId}_experimental_analysis.tar`, tar);
  };
  const exportVideo = async () => {
    const video = videoRef.current; if (!video || !dimensions.width || !dimensions.height || typeof MediaRecorder === "undefined") { setNotice("Analysis video export is unavailable in this browser."); return; }
    setVideoExporting(true); const originalTime = video.currentTime, wasPaused = video.paused;
    const canvas = document.createElement("canvas"); canvas.width = dimensions.width; canvas.height = dimensions.height; const context = canvas.getContext("2d"); if (!context) return;
    const stream = canvas.captureStream(Math.min(24, fps ?? 24)); const recorder = new MediaRecorder(stream, { mimeType: "video/webm" }); const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => { downloadBlob(`${episodeId}_analysis.webm`, new Blob(chunks, { type: "video/webm" })); try { await waitForSeek(video, originalTime); if (!wasPaused) await video.play(); } catch {} setVideoExporting(false); };
    const draw = () => { if (recorder.state === "inactive" || !context) return; context.drawImage(video, 0, 0, dimensions.width, dimensions.height); const frame = Math.round(video.currentTime * (fps ?? 0)); context.fillStyle = "rgba(0,0,0,.72)"; context.fillRect(0, 0, dimensions.width, 36); context.fillStyle = "white"; context.font = "16px monospace"; const active = temporal.find((item) => video.currentTime >= item.start_time_sec && video.currentTime <= item.end_time_sec); context.fillText(`${episodeId}  ${video.currentTime.toFixed(3)} sec  frame ${frame}  ${active?.label ?? "—"}`, 12, 24); for (const item of semantics.filter((record) => record.x_px !== null && Math.abs(record.frame_index - frame) <= 1)) { context.strokeStyle = item.source_type === "human_verified" ? "#d42b20" : "#ffd84d"; context.beginPath(); context.arc(item.x_px!, item.y_px!, 8, 0, Math.PI * 2); context.stroke(); context.fillStyle = context.strokeStyle; context.fillText(item.semantic_label, item.x_px! + 12, item.y_px! - 8); } requestAnimationFrame(draw); };
    video.addEventListener("ended", () => recorder.stop(), { once: true }); recorder.start(1000); await waitForSeek(video, 0); await video.play(); draw(); setNotice("Rendering a real-time browser derivative. The source MP4 is never modified.");
  };

  return <section className={styles.autoAnalysis} aria-labelledby="auto-analysis-title">
    <header className={styles.autoHeader}><div><p>INTERNAL / EXPERIMENTAL WORKBENCH</p><h2 id="auto-analysis-title">Auto analysis</h2><span>Independent browser-side layers. Failure in one module does not block temporal annotation.</span></div><div className={styles.autoRun}><fieldset><legend>Density</legend>{(["FAST","FULL"] as const).map((item) => <label key={item}><input checked={mode === item} name="analysis-mode" onChange={() => setMode(item)} type="radio" />{item}</label>)}</fieldset><button disabled={running || !episodeId} onClick={runAnalysis} type="button">{running ? "ANALYSIS RUNNING" : "RUN AUTO ANALYSIS"}</button></div></header>
    <p className={styles.analysisNotice} role="status">{notice}</p>
    <div className={styles.moduleStatus}>{MODULES.map((name) => <div key={name}><span>{name}</span><strong data-status={statuses[name]}>{formatStatus(statuses[name])}</strong></div>)}</div>
    <div className={styles.analysisColumns}><section><div className={styles.analysisSubhead}><div><p>SEMANTIC + TRACKING SEED</p><h3>Source-pixel inspection</h3></div><button disabled={!episodeId} onClick={captureReviewFrame} type="button">Capture current frame</button></div><p className={styles.analysisHelp}>Capture a frame, choose an interaction, then click. MediaPipe loads only when analysis or garment segmentation is requested.</p><label className={styles.semanticSelect}>Interaction<select onChange={(event) => setInteractionMode(event.target.value as InteractionMode)} value={interactionMode}><option value="landmark">Place landmark</option><option value="garment">Seed / reseed garment mask</option><option value="iron">Initialize / reinitialize iron</option></select></label>{interactionMode === "landmark" && <label className={styles.semanticSelect}>Landmark<select onChange={(event) => setPointLabel(event.target.value as PointLabel)} value={pointLabel}>{POINT_LABELS.map((label) => <option key={label}>{label}</option>)}</select></label>}<canvas aria-label="Semantic landmark and tracking seed frame" className={styles.semanticCanvas} hidden={!frameImage} onClick={addPoint} ref={canvasRef} /><div className={styles.semanticActions}><button disabled={!activeRegion || !episodeId} onClick={addRegion} type="button">Record active region</button><button disabled={!semantics.length} onClick={() => setSemantics([])} type="button">Clear semantic records</button></div><p className={styles.analysisHelp}>Mask: {mask ? `${mask.width}×${mask.height}, ${mask.source_type}` : "not seeded"}. Hands: {hands.length} detections. Pose-support samples: {poseSamples}. Tool: {toolTracks.length} tracked positions. Model proposals and tracked outputs remain reviewable estimates.</p></section>
      <section><div className={styles.analysisSubhead}><div><p>CONSOLIDATED REVIEW</p><h3>Review required</h3></div><strong>{slips.filter((item) => item.review_status === "candidate").length + maskTracks.filter((item) => item.tracking_status === "review_required").length + toolTracks.filter((item) => item.tracking_status === "review_required").length}</strong></div>{slips.length ? <ol className={styles.reviewQueue}>{slips.map((item,index) => <li key={`${item.start_frame}-${index}`}><div><strong>{item.event_label}</strong><span>{item.start_time_sec.toFixed(3)}–{item.end_time_sec.toFixed(3)} sec · frames {item.start_frame}–{item.end_frame}</span><small>{item.evidence}</small></div><div><button onClick={() => jumpTo(item.start_time_sec)} type="button">Jump</button><button disabled={item.review_status !== "candidate"} onClick={() => reviewSlip(index,"accepted")} type="button">Accept</button><button disabled={item.review_status !== "candidate"} onClick={() => reviewSlip(index,"rejected")} type="button">Reject</button></div></li>)}</ol> : <p className={styles.reviewEmpty}>No automatic review items yet. Run analysis to generate interpretable candidates.</p>}<div className={styles.analysisSummary}><span>RGB samples <b>{rgbScores.length}</b></span><span>Mask tracks <b>{maskTracks.length}</b></span><span>Slip candidates <b>{slips.length}</b></span><span>Accepted slip <b>{activeSlips.filter((item) => item.event_label === "slip").length}</b></span></div></section></div>
    <div className={styles.exportDeck}><div><p>EXPERIMENTAL OUTPUTS</p><h3>Export only what exists</h3><span>Temporal CSV remains unchanged and separate.</span></div><button disabled={!semantics.length} onClick={() => downloadBlob(`${episodeId}_semantics.csv`, new Blob([semanticCsv()], { type: "text/csv" }))} type="button">Export semantic CSV</button><button disabled={!hands.length} onClick={() => downloadBlob(`${episodeId}_hands.csv`, new Blob([handCsv()], { type: "text/csv" }))} type="button">Export hand-pose CSV</button><button disabled={!toolSeed && !toolTracks.length} onClick={() => downloadBlob(`${episodeId}_tool_track.csv`, new Blob([toolCsv()], { type: "text/csv" }))} type="button">Export tool-track CSV</button><button disabled={!slips.length} onClick={() => downloadBlob(`${episodeId}_slip.csv`, new Blob([slipCsv()], { type: "text/csv" }))} type="button">Export slip CSV</button><button disabled title="Depth is unavailable in this deployment." type="button">Export depth metadata</button><button disabled={!episodeId} onClick={() => downloadBlob(`${episodeId}_provenance.json`, new Blob([provenanceJson()], { type: "application/json" }))} type="button">Export provenance</button><button disabled={!episodeId || videoExporting} onClick={exportVideo} type="button">{videoExporting ? "Rendering video" : "Export analysis video"}</button><button disabled={!episodeId} onClick={exportPackage} type="button">Export episode package</button></div>
    <p className={styles.analysisHelp}>MediaPipe Tasks Vision {MEDIAPIPE_VERSION}; Hand Landmarker, Pose Landmarker, and Interactive Segmenter models load remotely from Google-hosted assets. Model URLs are recorded in provenance: {Object.keys(MEDIAPIPE_MODELS).join(", ")}.</p>
    <div className={styles.scienceCaveat}><strong>Scientific status</strong><span>Optical flow is image motion, not calibrated physical velocity.</span><span>Slip candidates are not verified slip until accepted by a human.</span><span>RGB response is experimental: not ground truth, physical wrinkle height, or measured geometry.</span><span>Depth not available in current deployment. Estimated 3D unavailable without depth.</span></div>
  </section>;
}
