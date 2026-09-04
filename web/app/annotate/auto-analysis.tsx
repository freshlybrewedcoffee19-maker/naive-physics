"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downloadBlob, makeCsv, makeTar } from "./analysis-export";
import { detectHandsAndPose, MEDIAPIPE_MODELS, MEDIAPIPE_VERSION, segmentFromPoint } from "./mediapipe-analysis";
import { acceptedLabel, enforceEpisodeStateBoundaries, generateTemporalCandidates, summarizeTemporalCoverage, TEMPORAL_TRACKS, type CandidateLabel, type TemporalCandidate, type TemporalLabel } from "./temporal-candidates";
import styles from "./annotate.module.css";
import temporalStyles from "./temporal-review.module.css";

type Status = "not_started" | "running" | "complete" | "partial" | "failed" | "unavailable";
type SourceType = "human_annotated" | "human_verified" | "model_estimated" | "auto_tracked" | "derived_from_rgb";
type Mode = "FAST" | "FULL";
type ModuleName = "Garment segmentation" | "Semantic keypoints" | "Hand pose" | "Iron tracking" | "Optical flow" | "Slip candidates" | "RGB analysis" | "Depth estimate" | "Estimated 3D";
type PointLabel = "left_shoulder" | "right_shoulder" | "left_sleeve_tip" | "right_sleeve_tip" | "left_hem" | "right_hem" | "garment_center" | "anchor_point" | "iron_contact_point";
type SemanticRecord = { episode_id: string; frame_index: number; timestamp_sec: number; semantic_type: "keypoint" | "region"; semantic_label: PointLabel | string; x_px: number | null; y_px: number | null; source_type: SourceType; confidence: number | null; algorithm_version: string };
type SlipRecord = { episode_id: string; start_frame: number; end_frame: number; start_time_sec: number; end_time_sec: number; event_label: "slip_candidate" | "slip"; candidate_score: number; review_status: "candidate" | "accepted" | "rejected"; source_type: SourceType; algorithm_version: string; evidence: string };
type TemporalRecord = { label: string; start_time_sec: number; end_time_sec: number; source_type: "human_annotated" | "human_verified" };
type InteractionMode = "landmark" | "garment" | "iron";
type HandRecord = { episode_id: string; frame_index: number; timestamp_sec: number; hand_index: number; handedness: string; center_x_px: number; center_y_px: number; landmarks_json: string; source_type: "model_estimated" | "auto_tracked"; algorithm_version: string };
type ToolRecord = { episode_id: string; frame_index: number; timestamp_sec: number; x_px: number; y_px: number; width_px: number; height_px: number; center_x_px: number; center_y_px: number; source_type: "human_verified" | "auto_tracked"; tracking_status: "seed" | "tracked" | "review_required"; algorithm_version: string };
type MaskState = { width: number; height: number; values: Float32Array; seedTime: number; seedX: number; seedY: number; source_type: "model_estimated" | "human_verified" };
type MaskTrack = { frame_index: number; timestamp_sec: number; offset_x_px: number; offset_y_px: number; source_type: "model_estimated" | "auto_tracked"; tracking_status: "seed" | "tracked" | "review_required" };
type InteractionContext = { revision: number; contextLevel: "UNANALYZED" | "FULL" | "LIMITED"; mask: MaskState | null; maskTracks: MaskTrack[]; toolSeed: ToolRecord | null; toolTracks: ToolRecord[]; toolOnGarmentTimes: number[] };

const MODULES: ModuleName[] = ["Garment segmentation", "Semantic keypoints", "Hand pose", "Iron tracking", "Optical flow", "Slip candidates", "RGB analysis", "Depth estimate", "Estimated 3D"];
const POINT_LABELS: PointLabel[] = ["left_shoulder", "right_shoulder", "left_sleeve_tip", "right_sleeve_tip", "left_hem", "right_hem", "garment_center", "anchor_point", "iron_contact_point"];
const SEMANTIC_COLUMNS = ["episode_id","frame_index","timestamp_sec","semantic_type","semantic_label","x_px","y_px","source_type","confidence","algorithm_version"] as const;
const SLIP_COLUMNS = ["episode_id","start_frame","end_frame","start_time_sec","end_time_sec","event_label","candidate_score","review_status","source_type","algorithm_version"] as const;
const HAND_COLUMNS = ["episode_id","frame_index","timestamp_sec","hand_index","handedness","center_x_px","center_y_px","landmarks_json","source_type","algorithm_version"] as const;
const TOOL_COLUMNS = ["episode_id","frame_index","timestamp_sec","x_px","y_px","width_px","height_px","center_x_px","center_y_px","source_type","tracking_status","algorithm_version"] as const;
const TEMPORAL_CANDIDATE_COLUMNS = ["episode_id","candidate_id","track","proposed_label","start_frame","end_frame","start_time_sec","end_time_sec","duration_sec","candidate_score","evidence","review_status","source_type","algorithm_version"] as const;
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
const roundTime = (value: number) => Math.round(value * 1000) / 1000;
const GARMENT_LANDMARKS = new Set<PointLabel>(["left_shoulder","right_shoulder","left_sleeve_tip","right_sleeve_tip","left_hem","right_hem","garment_center"]);
type TimedTrack = { timestamp_sec: number; tracking_status: "seed" | "tracked" | "review_required" };
type TrackInterval<T> = { before: T; after: T; ratio: number };
const validTrackInterval = <T extends TimedTrack>(records: T[], time: number): TrackInterval<T> | null => {
  const sorted = records.toSorted((a,b)=>a.timestamp_sec-b.timestamp_sec);
  for (let index=0;index<sorted.length-1;index+=1) {
    const before=sorted[index], after=sorted[index+1];
    if (time<before.timestamp_sec||time>after.timestamp_sec) continue;
    if (before.tracking_status==="review_required"||after.tracking_status==="review_required") return null;
    const span=after.timestamp_sec-before.timestamp_sec;
    return { before,after,ratio:span>0?(time-before.timestamp_sec)/span:0 };
  }
  return null;
};
const validCoverage = <T extends TimedTrack>(records: T[]) => {
  const sorted=records.toSorted((a,b)=>a.timestamp_sec-b.timestamp_sec); let seconds=0;
  const intervals:Array<{start:number;end:number}>=[];
  for (let index=0;index<sorted.length-1;index+=1) {
    const before=sorted[index],after=sorted[index+1];
    if (before.tracking_status==="review_required"||after.tracking_status==="review_required"||after.timestamp_sec<=before.timestamp_sec) continue;
    intervals.push({start:before.timestamp_sec,end:after.timestamp_sec}); seconds+=after.timestamp_sec-before.timestamp_sec;
  }
  return {seconds,intervals};
};
const hiddenIntervals = (coverage:Array<{start:number;end:number}>,episodeDuration:number) => {
  const hidden:Array<{start:number;end:number}>=[]; let cursor=0;
  for (const interval of coverage) { if (interval.start>cursor) hidden.push({start:cursor,end:interval.start}); cursor=Math.max(cursor,interval.end); }
  if (cursor<episodeDuration) hidden.push({start:cursor,end:episodeDuration});
  return hidden;
};

export function AutoAnalysis({ videoRef, episodeId, fps, currentTime, duration, dimensions, activeRegion, temporal, onAcceptTemporal }: { videoRef: RefObject<HTMLVideoElement | null>; episodeId: string; fps: number | null; currentTime: number; duration: number; dimensions: { width: number; height: number }; activeRegion: string; temporal: TemporalRecord[]; onAcceptTemporal: (candidate: { label: TemporalLabel; start_time_sec: number; end_time_sec: number }) => boolean }) {
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
  const [interactionContext, setInteractionContextState] = useState<InteractionContext>({ revision:0,contextLevel:"UNANALYZED",mask:null,maskTracks:[],toolSeed:null,toolTracks:[],toolOnGarmentTimes:[] });
  const interactionContextRef = useRef(interactionContext);
  const commitInteractionContext = (next: InteractionContext) => { interactionContextRef.current=next; setInteractionContextState(next); };
  const { mask,maskTracks,toolSeed,toolTracks } = interactionContext;
  const [slips, setSlips] = useState<SlipRecord[]>([]);
  const [rgbScores, setRgbScores] = useState<Array<{ frame: number; time: number; score: number }>>([]);
  const [videoExporting, setVideoExporting] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [analysisAttempted, setAnalysisAttempted] = useState(false);
  const [temporalCandidates, setTemporalCandidates] = useState<TemporalCandidate[]>([]);
  const [temporalContextRevision, setTemporalContextRevision] = useState<number | null>(null);
  const [exportValidation, setExportValidation] = useState("");
  const [adjustingCandidate, setAdjustingCandidate] = useState<string | null>(null);
  const setStatus = (name: ModuleName, status: Status) => setStatuses((current) => ({ ...current, [name]: status }));
  const activeSlips = useMemo(() => slips.filter((item) => item.review_status !== "rejected"), [slips]);
  const temporalCoverage = useMemo(() => summarizeTemporalCoverage(temporalCandidates,duration),[duration,temporalCandidates]);
  const missingTemporalContext = useMemo(() => [!mask || !maskTracks.length ? "garment mask tracking" : null,!toolSeed || !toolTracks.length ? "iron tracking" : null].filter(Boolean) as string[],[mask,maskTracks.length,toolSeed,toolTracks.length]);

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
    if (!frameImage || !episodeId || !fps || running) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.round((event.clientX - rect.left) / rect.width * dimensions.width), y = Math.round((event.clientY - rect.top) / rect.height * dimensions.height);
    if (interactionMode === "garment") {
      try {
        setStatus("Garment segmentation", "running"); setNotice("Loading MediaPipe and generating a mask from the garment seed…");
        const canvas = event.currentTarget;
        const generated = await segmentFromPoint(canvas, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
        const nextMask: MaskState = { ...generated, seedTime: currentTime, seedX: x, seedY: y, source_type: mask ? "human_verified" : "model_estimated" };
        commitInteractionContext({ ...interactionContextRef.current,revision:interactionContextRef.current.revision+1,contextLevel:"UNANALYZED",mask:nextMask,maskTracks:[],toolTracks:[],toolOnGarmentTimes:[] }); setStatus("Garment segmentation", "complete");
        const points = proposeGarmentPoints(nextMask, dimensions, episodeId, currentTime, fps);
        setSemantics((current) => [...current.filter((item) => !points.some((point) => point.frame_index === item.frame_index && point.semantic_label === item.semantic_label)), ...points]);
        setStatus("Semantic keypoints", points.length ? "partial" : "failed"); setNotice(`Genuine MediaPipe garment mask produced. ${points.length} geometry proposals require review.`);
      } catch (error) { setStatus("Garment segmentation", "failed"); setNotice(`Segmentation failed non-fatally: ${error instanceof Error ? error.message : "unknown error"}`); }
      return;
    }
    if (interactionMode === "iron") {
      const width = Math.max(48, Math.round(dimensions.width * .16)), height = Math.max(40, Math.round(dimensions.height * .18));
      const seed: ToolRecord = { episode_id: episodeId, frame_index: Math.round(currentTime * fps), timestamp_sec: currentTime, x_px: Math.max(0, Math.round(x - width / 2)), y_px: Math.max(0, Math.round(y - height / 2)), width_px: width, height_px: height, center_x_px: x, center_y_px: y, source_type: "human_verified", tracking_status: "seed", algorithm_version: "initialized_block_tracker_v0_1" };
      commitInteractionContext({ ...interactionContextRef.current,revision:interactionContextRef.current.revision+1,contextLevel:"UNANALYZED",toolSeed:seed,toolTracks:[],toolOnGarmentTimes:[] }); setStatus("Iron tracking", "partial"); setNotice("Iron tracker initialized. Run Auto Analysis to propagate this visible region."); return;
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
    const runContext=interactionContextRef.current;
    const runMask=runContext.mask, runToolSeed=runContext.toolSeed;
    setRunning(true); setAnalysisReady(false); setAnalysisAttempted(true); setNotice(`${mode} analysis running. Temporal annotation remains independent.`);
    setTemporalCandidates([]); setTemporalContextRevision(null); setExportValidation("");
    const originalTime = video.currentTime, wasPaused = video.paused;
    setStatus("Garment segmentation", "running"); setStatus("Semantic keypoints", "running"); setStatus("Hand pose", "running"); setStatus("Iron tracking", "running");
    setStatus("Optical flow", "running"); setStatus("Slip candidates", "running"); setStatus("RGB analysis", "running"); setStatus("Depth estimate", "running"); setStatus("Estimated 3D", "running");
    try {
      setStatus("Garment segmentation", runMask ? "partial" : "not_started");
      setStatus("Semantic keypoints", semantics.length ? "partial" : "not_started");
      setStatus("Hand pose", "running");
      setStatus("Iron tracking", runToolSeed ? "running" : "not_started");
      setStatus("Depth estimate", "unavailable"); setStatus("Estimated 3D", "unavailable");
      const count = mode === "FAST" ? 5 : 12, interval = .2;
      const baseTimes = Array.from({ length: count }, (_, index) => Math.min(Math.max(0, duration - interval - .05), (index + 1) / (count + 1) * duration));
      const postSeedTimes = runToolSeed ? [runToolSeed.timestamp_sec + interval,runToolSeed.timestamp_sec + Math.max(1,duration/(count+1))].filter((time)=>time<duration-.05) : [];
      const times = [...new Set([...baseTimes,...postSeedTimes].map((time)=>roundTime(time)))].sort((a,b)=>a-b);
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
          if (runMask) nextMaskTracks.push({ frame_index: Math.round(time * fps), timestamp_sec: time, offset_x_px: Math.round(cumulativeX), offset_y_px: Math.round(cumulativeY), source_type: Math.abs(time - runMask.seedTime) < .001 ? "model_estimated" : "auto_tracked", tracking_status: flow.relative < 2.8 ? "tracked" : "review_required" });
          if (runToolSeed && time > runToolSeed.timestamp_sec) {
            const cx = runToolSeed.center_x_px + cumulativeX, cy = runToolSeed.center_y_px + cumulativeY;
            const inBounds = cx >= 0 && cx < dimensions.width && cy >= 0 && cy < dimensions.height;
            nextTools.push({ ...runToolSeed, frame_index: Math.round(time * fps), timestamp_sec: time, x_px: Math.round(cx - runToolSeed.width_px / 2), y_px: Math.round(cy - runToolSeed.height_px / 2), center_x_px: Math.round(cx), center_y_px: Math.round(cy), source_type: "auto_tracked", tracking_status: inBounds && flow.relative < 2.8 ? "tracked" : "review_required" });
          }
          nextRgb.push({ frame: Math.round(time * fps), time, score: rgbResponse(first) });
          const ironEvidence = Boolean(runToolSeed), garmentEvidence = Boolean(runMask);
          const interactionBoost = (handEvidence ? .08 : 0) + (ironEvidence ? .08 : 0) + (garmentEvidence ? .08 : 0);
          if (flow.relative >= 1.15) nextSlips.push({ episode_id: episodeId, start_frame: Math.round(time * fps), end_frame: Math.round((time + interval) * fps), start_time_sec: time, end_time_sec: time + interval, event_label: "slip_candidate", candidate_score: Math.min(1, score + interactionBoost), review_status: "candidate", source_type: "auto_tracked", algorithm_version: "slip_candidate_interaction_evidence_v0_2", evidence: `Garment-mask=${garmentEvidence}; hand=${handEvidence}; iron-track=${ironEvidence}; local relative motion=${flow.relative.toFixed(3)} px; global translation=${flow.global.toFixed(3)} px; ${flow.vectorCount} blocks. Human verification required.` });
        } catch { /* independent sample failure */ }
      }
      const interactionPoints: SemanticRecord[] = [];
      nextHands.forEach((hand) => {
        if (temporal.some((item) => item.label === "anchor" && hand.timestamp_sec >= item.start_time_sec && hand.timestamp_sec <= item.end_time_sec)) interactionPoints.push({ episode_id: episodeId, frame_index: hand.frame_index, timestamp_sec: hand.timestamp_sec, semantic_type: "keypoint", semantic_label: "anchor_point", x_px: Math.round(hand.center_x_px), y_px: Math.round(hand.center_y_px), source_type: "model_estimated", confidence: null, algorithm_version: "hand_center_anchor_candidate_v0_1" });
      });
      if (runMask) nextTools.forEach((tool) => {
        const mx = Math.max(0, Math.min(runMask.width - 1, Math.floor(tool.center_x_px / dimensions.width * runMask.width)));
        const my = Math.max(0, Math.min(runMask.height - 1, Math.floor(tool.center_y_px / dimensions.height * runMask.height)));
        if (runMask.values[my * runMask.width + mx] > .5) interactionPoints.push({ episode_id: episodeId, frame_index: tool.frame_index, timestamp_sec: tool.timestamp_sec, semantic_type: "keypoint", semantic_label: "iron_contact_point", x_px: tool.center_x_px, y_px: tool.center_y_px, source_type: "auto_tracked", confidence: null, algorithm_version: "mask_overlap_contact_candidate_v0_1" });
      });
      if (interactionPoints.length) setSemantics((current) => [...current.filter((item) => !interactionPoints.some((point) => point.frame_index === item.frame_index && point.semantic_label === item.semantic_label)), ...interactionPoints]);
      const toolOnGarmentTimes=interactionPoints.filter((item)=>item.semantic_label==="iron_contact_point").map((item)=>item.timestamp_sec);
      const contextLevel=nextMaskTracks.length>0&&nextTools.length>0?"FULL":"LIMITED";
      setRgbScores(nextRgb); setSlips(nextSlips); setHands(nextHands); setPoseSamples(nextPoseSamples); commitInteractionContext({ ...runContext,revision:runContext.revision+1,contextLevel,maskTracks:nextMaskTracks,toolTracks:nextTools,toolOnGarmentTimes });
      setStatus("Hand pose", handFailures.length ? (nextHands.length ? "partial" : "failed") : "complete");
      setStatus("Iron tracking", runToolSeed ? (!nextTools.length ? "failed" : nextTools.some((item) => item.tracking_status === "review_required") ? "partial" : "complete") : "not_started");
      if (runMask) setStatus("Garment segmentation", nextMaskTracks.length ? (nextMaskTracks.some((item)=>item.tracking_status==="review_required") ? "partial" : "complete") : "failed");
      setStatus("Optical flow", nextRgb.length === times.length ? "complete" : nextRgb.length ? "partial" : "failed");
      setStatus("RGB analysis", nextRgb.length ? "complete" : "failed");
      setStatus("Slip candidates", nextRgb.length ? "complete" : "failed");
      const propagationFailures=[runMask&&!nextMaskTracks.length?"Garment seed exists, but tracking did not propagate.":null,runToolSeed&&!nextTools.length?"Iron seed exists, but tracking did not propagate.":null].filter(Boolean).join(" ");
      setNotice(`Analysis complete: ${nextRgb.length} sampled frames, ${nextHands.length} hand detections, ${nextTools.length} tool positions, ${nextSlips.length} slip candidates.${propagationFailures?` ${propagationFailures}`:""}${handFailures.length ? ` Hand Pose ${nextHands.length ? "partially failed" : "failed"}: ${handFailures[0]}` : ""} No candidate is ground truth.`);
      setAnalysisReady(nextRgb.length > 0);
    } finally {
      try { await waitForSeek(video, originalTime); if (!wasPaused) await video.play(); } catch { /* playback restoration must not block results */ }
      setRunning(false);
    }
  };

  const reviewSlip = (index: number, review_status: "accepted" | "rejected") => setSlips((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, review_status, event_label: review_status === "accepted" ? "slip" : "slip_candidate", source_type: review_status === "accepted" ? "human_verified" : item.source_type } : item));
  const generateCandidates = () => {
    if (!analysisReady || !fps) return;
    const context=interactionContextRef.current;
    const missing=[!context.mask||!context.maskTracks.length?"garment mask tracking":null,!context.toolSeed||!context.toolTracks.length?"iron tracking":null].filter(Boolean) as string[];
    const generated = generateTemporalCandidates({ episodeId, duration, fps, hands, tools: context.toolTracks, toolOnGarmentTimes:context.toolOnGarmentTimes, garmentTrackTimes:context.maskTracks.filter((item)=>item.tracking_status==="tracked").map((item)=>item.timestamp_sec), slips: slips.filter((item)=>item.review_status!=="rejected"), rgb: rgbScores, garmentMaskAvailable:Boolean(context.mask&&context.maskTracks.length) });
    const contextNote=missing.length?` Limited context: missing ${missing.join(" and ")}.`:" Garment mask and iron tracking were used.";
    setTemporalCandidates(generated); setTemporalContextRevision(context.revision); setExportValidation(""); setAdjustingCandidate(null); setNotice(`${generated.length} temporal candidates generated for review.${contextNote} No annotation was accepted automatically.`);
  };
  const updateCandidate = (id: string, patch: Partial<TemporalCandidate>) => setTemporalCandidates((current)=>current.map((item)=>item.candidate_id===id ? { ...item,...patch } : item));
  const acceptCandidate = (id: string) => {
    const item=temporalCandidates.find((candidate)=>candidate.candidate_id===id);
    if (!item || !["candidate","adjusted"].includes(item.review_status)) return;
    const accepted=onAcceptTemporal({ label:acceptedLabel(item.proposed_label),start_time_sec:item.start_time_sec,end_time_sec:item.end_time_sec });
    if (accepted) setTemporalCandidates((current)=>enforceEpisodeStateBoundaries(current.map((candidate)=>candidate.candidate_id===id ? { ...candidate,review_status:"accepted",source_type:"human_verified" } : candidate),fps??0));
  };
  const rejectCandidate = (id: string) => updateCandidate(id,{ review_status:"rejected" });
  const saveAdjustment = (item: TemporalCandidate) => {
    const start=Math.max(0,Math.min(duration,item.start_time_sec)), end=Math.max(start,Math.min(duration,item.end_time_sec));
    updateCandidate(item.candidate_id,{ start_time_sec:start,end_time_sec:end,start_frame:Math.round(start*(fps??0)),end_frame:Math.round(end*(fps??0)),duration_sec:roundTime(end-start),review_status:"adjusted",source_type:"human_verified",original_start_time_sec:item.original_start_time_sec??item.start_time_sec,original_end_time_sec:item.original_end_time_sec??item.end_time_sec,original_label:item.original_label??item.proposed_label });
    setAdjustingCandidate(null);
  };
  const acceptHighConfidenceForLabel = (label: CandidateLabel) => {
    temporalCandidates.filter((item)=>item.proposed_label===label && item.review_status==="candidate" && (item.candidate_score??0)>=.75).forEach((item)=>acceptCandidate(item.candidate_id));
  };
  const jumpTo = (time: number) => { const video = videoRef.current; if (video) video.currentTime = time; };
  const semanticCsv = () => makeCsv(SEMANTIC_COLUMNS, semantics.map((item) => [item.episode_id,item.frame_index,item.timestamp_sec.toFixed(3),item.semantic_type,item.semantic_label,item.x_px,item.y_px,item.source_type,item.confidence,item.algorithm_version]));
  const handCsv = () => makeCsv(HAND_COLUMNS, hands.map((item) => [item.episode_id,item.frame_index,item.timestamp_sec.toFixed(3),item.hand_index,item.handedness,item.center_x_px.toFixed(2),item.center_y_px.toFixed(2),item.landmarks_json,item.source_type,item.algorithm_version]));
  const toolCsv = (context=interactionContextRef.current) => makeCsv(TOOL_COLUMNS, [...(context.toolSeed ? [context.toolSeed] : []), ...context.toolTracks].map((item) => [item.episode_id,item.frame_index,item.timestamp_sec.toFixed(3),item.x_px,item.y_px,item.width_px,item.height_px,item.center_x_px,item.center_y_px,item.source_type,item.tracking_status,item.algorithm_version]));
  const slipCsv = () => makeCsv(SLIP_COLUMNS, slips.map((item) => [item.episode_id,item.start_frame,item.end_frame,item.start_time_sec.toFixed(3),item.end_time_sec.toFixed(3),item.event_label,item.candidate_score.toFixed(6),item.review_status,item.source_type,item.algorithm_version]));
  const temporalCandidateCsv = () => makeCsv(TEMPORAL_CANDIDATE_COLUMNS,temporalCandidates.map((item)=>[item.episode_id,item.candidate_id,item.track,item.proposed_label,item.start_frame,item.end_frame,item.start_time_sec.toFixed(3),item.end_time_sec.toFixed(3),item.duration_sec.toFixed(3),item.candidate_score===null?null:item.candidate_score.toFixed(3),item.evidence,item.review_status,item.source_type,item.algorithm_version]));
  const provenanceJson = (context=interactionContextRef.current) => JSON.stringify({ episode_id: episodeId, workbench: "internal_experimental", generated_at: new Date().toISOString(), dependency: { name: "@mediapipe/tasks-vision", version: MEDIAPIPE_VERSION, license: "Apache-2.0" }, remote_models: MEDIAPIPE_MODELS, algorithms: { semantic: "mask_geometry_proposal_v0_1", motion: "block_flow_v0_1", hand: "mediapipe_hand_landmarker_v1", pose_support: "mediapipe_pose_landmarker_lite_v1", garment_mask: "mediapipe_magic_touch_v1", mask_propagation: "block_flow_translation_v0_1", iron: "initialized_block_tracker_v0_1", slip: "slip_candidate_interaction_evidence_v0_2", rgb: "rgb_sampled_response_v0_1" }, outputs: { hand_records: hands.length, pose_support_samples: poseSamples, mask_seeded: Boolean(context.mask), mask_track_records: context.maskTracks.length, tool_track_records: context.toolTracks.length }, source_types: ["human_annotated","human_verified","model_estimated","auto_tracked","derived_from_rgb"], limitations: ["RGB only","model and tracked output are not ground truth","block-flow is image motion, not calibrated physical velocity","mask propagation and iron tracking are approximate","slip candidates require human review","no sensor depth","no force or tactile sensing"] }, null, 2);
  const exportPackage = async () => {
    const context=interactionContextRef.current;
    if (context.contextLevel==="FULL"&&(context.maskTracks.length===0||context.toolTracks.length===0)) { setExportValidation("Export blocked: FULL interaction context does not match the tracking records."); return; }
    if (temporalCandidates.length&&temporalContextRevision!==context.revision) { setExportValidation("Export blocked: temporal candidates were generated from an older interaction-context snapshot. Generate them again before export."); return; }
    setExportValidation("");
    const files: Array<{ name: string; content: string }> = [];
    if (semantics.length) files.push({ name: `${episodeId}/semantics.csv`, content: semanticCsv() });
    if (hands.length) files.push({ name: `${episodeId}/hands.csv`, content: handCsv() });
    if (context.toolSeed || context.toolTracks.length) files.push({ name: `${episodeId}/tool_track.csv`, content: toolCsv(context) });
    if (slips.length) files.push({ name: `${episodeId}/slip.csv`, content: slipCsv() });
    if (temporalCandidates.length) files.push({ name: `${episodeId}/temporal_candidates.csv`, content: temporalCandidateCsv() });
    files.push({ name: `${episodeId}/provenance.json`, content: provenanceJson(context) });
    const tar = await makeTar(files); downloadBlob(`${episodeId}_experimental_analysis.tar`, tar);
  };
  const exportVideo = async () => {
    const video = videoRef.current; if (!video || !dimensions.width || !dimensions.height || typeof MediaRecorder === "undefined") { setNotice("Analysis video export is unavailable in this browser."); return; }
    const exportContext=interactionContextRef.current;
    if (exportContext.revision!==interactionContext.revision) { setExportValidation("Analysis video export blocked: the visible analysis state is stale."); return; }
    if (exportContext.contextLevel==="FULL"&&(!exportContext.maskTracks.length||!exportContext.toolTracks.length)) { setExportValidation("Analysis video export blocked: FULL interaction context does not match the tracking records."); return; }
    if (temporalCandidates.length&&temporalContextRevision!==exportContext.revision) { setExportValidation("Analysis video export blocked: temporal candidates were generated from an older interaction-context snapshot."); return; }
    setExportValidation("");
    const semanticSnapshot=semantics.map((item)=>({...item})), temporalSnapshot=temporal.map((item)=>({...item})), slipSnapshot=slips.map((item)=>({...item}));
    const maskSeed:MaskTrack|null=exportContext.mask?{frame_index:Math.round(exportContext.mask.seedTime*(fps??0)),timestamp_sec:exportContext.mask.seedTime,offset_x_px:0,offset_y_px:0,source_type:exportContext.mask.source_type==="human_verified"?"model_estimated":exportContext.mask.source_type,tracking_status:"seed"}:null;
    const maskRecords=[...(maskSeed?[maskSeed]:[]),...exportContext.maskTracks];
    const toolRecords=[...(exportContext.toolSeed?[exportContext.toolSeed]:[]),...exportContext.toolTracks];
    const maskCoverage=validCoverage(maskRecords), ironCoverage=validCoverage(toolRecords);
    const maskHidden=hiddenIntervals(maskCoverage.intervals,duration), ironHidden=hiddenIntervals(ironCoverage.intervals,duration);
    const sourceFps=fps??24, frameTolerance=.5/sourceFps;
    setVideoExporting(true); const originalTime = video.currentTime, wasPaused = video.paused;
    const canvas = document.createElement("canvas"); canvas.width = dimensions.width; canvas.height = dimensions.height; const context = canvas.getContext("2d"); if (!context) return;
    const stream = canvas.captureStream(Math.min(24, sourceFps)); const recorder = new MediaRecorder(stream, { mimeType: "video/webm" }); const chunks: BlobPart[] = []; let invalidated=false,renderedFrames=0,lastFrame=-1;
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      if (!invalidated) {
        downloadBlob(`${episodeId}_analysis.webm`,new Blob(chunks,{type:"video/webm"}));
        const percent=(seconds:number)=>duration?seconds/duration*100:0;
        const formatHidden=(items:Array<{start:number;end:number}>)=>items.length?items.map((item)=>`${item.start.toFixed(3)}–${item.end.toFixed(3)} sec`).join(", "):"none";
        setNotice(`Analysis video exported: ${renderedFrames} source frames rendered. Semantic tracking ${maskCoverage.seconds.toFixed(3)} sec (${percent(maskCoverage.seconds).toFixed(1)}%); iron tracking ${ironCoverage.seconds.toFixed(3)} sec (${percent(ironCoverage.seconds).toFixed(1)}%). Hidden semantic intervals: ${formatHidden(maskHidden)}. Hidden iron intervals: ${formatHidden(ironHidden)}.`);
      }
      try { await waitForSeek(video, originalTime); if (!wasPaused) await video.play(); } catch {} setVideoExporting(false);
    };
    const drawPoint=(x:number,y:number,label:string,source:SourceType) => {
      const color=source==="human_verified"?"#ff4a3d":source==="model_estimated"?"#ffd84d":"#62d9ff";
      context.strokeStyle=color;context.fillStyle=color;context.lineWidth=2;context.beginPath();context.arc(x,y,7,0,Math.PI*2);context.stroke();context.fillText(label,x+11,y-7);
    };
    const draw = () => {
      if (recorder.state === "inactive" || !context) return;
      if (interactionContextRef.current.revision!==exportContext.revision) { invalidated=true;setExportValidation("Analysis video export stopped: analysis state changed during rendering.");recorder.stop();return; }
      const time=video.currentTime,frame=Math.round(time*sourceFps);
      if (frame!==lastFrame) {
        lastFrame=frame;renderedFrames+=1;context.drawImage(video,0,0,dimensions.width,dimensions.height);
        context.font=`${Math.max(12,Math.round(dimensions.width*.016))}px monospace`;context.lineWidth=2;
        const maskInterval=validTrackInterval(maskRecords,time);
        for (const label of GARMENT_LANDMARKS) {
          const observations=semanticSnapshot.filter((item)=>item.semantic_label===label&&item.x_px!==null&&item.y_px!==null).toSorted((a,b)=>a.timestamp_sec-b.timestamp_sec);
          const exact=observations.find((item)=>Math.abs(item.timestamp_sec-time)<=frameTolerance);
          if (exact) { drawPoint(exact.x_px!,exact.y_px!,label,exact.source_type);continue; }
          if (!maskInterval||!observations.length) continue;
          const base=observations.reduce((best,item)=>Math.abs(item.timestamp_sec-time)<Math.abs(best.timestamp_sec-time)?item:best);
          const baseMask=validTrackInterval(maskRecords,base.timestamp_sec);
          if (!baseMask) continue;
          const interpolateOffset=(interval:TrackInterval<MaskTrack>)=>({x:interval.before.offset_x_px+(interval.after.offset_x_px-interval.before.offset_x_px)*interval.ratio,y:interval.before.offset_y_px+(interval.after.offset_y_px-interval.before.offset_y_px)*interval.ratio});
          const nowOffset=interpolateOffset(maskInterval),baseOffset=interpolateOffset(baseMask);
          drawPoint(base.x_px!+nowOffset.x-baseOffset.x,base.y_px!+nowOffset.y-baseOffset.y,label,"auto_tracked");
        }
        const toolInterval=validTrackInterval(toolRecords,time);
        if (toolInterval) {
          const mix=(a:number,b:number)=>a+(b-a)*toolInterval.ratio,x=mix(toolInterval.before.x_px,toolInterval.after.x_px),y=mix(toolInterval.before.y_px,toolInterval.after.y_px),width=mix(toolInterval.before.width_px,toolInterval.after.width_px),height=mix(toolInterval.before.height_px,toolInterval.after.height_px),centerX=mix(toolInterval.before.center_x_px,toolInterval.after.center_x_px),centerY=mix(toolInterval.before.center_y_px,toolInterval.after.center_y_px);
          const source:SourceType=toolInterval.ratio===0&&toolInterval.before.source_type==="human_verified"?"human_verified":"auto_tracked";const color=source==="human_verified"?"#ff4a3d":"#62d9ff";
          context.strokeStyle=color;context.fillStyle=color;context.strokeRect(x,y,width,height);context.beginPath();context.moveTo(centerX-6,centerY);context.lineTo(centerX+6,centerY);context.moveTo(centerX,centerY-6);context.lineTo(centerX,centerY+6);context.stroke();context.fillText("IRON",x,y-7);
          const contactTimes=new Set(exportContext.toolOnGarmentTimes.map((value)=>value.toFixed(3)));
          if (contactTimes.has(toolInterval.before.timestamp_sec.toFixed(3))&&contactTimes.has(toolInterval.after.timestamp_sec.toFixed(3))) drawPoint(centerX,centerY,"iron_contact_point","auto_tracked");
        }
        for (const item of semanticSnapshot.filter((record)=>["anchor_point","iron_contact_point"].includes(record.semantic_label)&&record.x_px!==null&&Math.abs(record.timestamp_sec-time)<=frameTolerance)) drawPoint(item.x_px!,item.y_px!,item.semantic_label,item.source_type);
        const acceptedSlip=slipSnapshot.find((item)=>item.review_status==="accepted"&&time>=item.start_time_sec&&time<=item.end_time_sec), candidateSlip=slipSnapshot.find((item)=>item.review_status==="candidate"&&time>=item.start_time_sec&&time<=item.end_time_sec);
        const activeTemporal=temporalSnapshot.filter((item)=>time>=item.start_time_sec&&time<=item.end_time_sec).map((item)=>item.label).join(" + ")||"—";
        const region=semanticSnapshot.find((item)=>item.semantic_type==="region")?.semantic_label||activeRegion||"—";
        context.fillStyle="rgba(0,0,0,.78)";context.fillRect(0,0,dimensions.width,Math.max(52,dimensions.height*.11));context.fillStyle="white";
        context.fillText(`${episodeId}  ${time.toFixed(3)} sec  frame ${frame}`,12,20);context.fillText(`TEMPORAL ${activeTemporal}  REGION ${region}`,12,42);
        if (acceptedSlip) {context.fillStyle="#ff4a3d";context.fillText("VERIFIED SLIP",dimensions.width-150,20);} else if (candidateSlip) {context.fillStyle="#ffd84d";context.fillText("UNREVIEWED slip_candidate",dimensions.width-250,20);}
        const legendY=dimensions.height-12;context.fillStyle="rgba(0,0,0,.72)";context.fillRect(0,dimensions.height-34,dimensions.width,34);context.fillStyle="#ff4a3d";context.fillText("● HUMAN VERIFIED",12,legendY);context.fillStyle="#ffd84d";context.fillText("● MODEL ESTIMATE",170,legendY);context.fillStyle="#62d9ff";context.fillText("● AUTO TRACK",330,legendY);
      }
      requestAnimationFrame(draw);
    };
    video.addEventListener("ended", () => recorder.stop(), { once: true }); recorder.start(1000); await waitForSeek(video, 0); await video.play(); draw(); setNotice("Rendering a real-time browser derivative. The source MP4 is never modified.");
  };

  return <section className={styles.autoAnalysis} aria-labelledby="auto-analysis-title">
    <header className={styles.autoHeader}><div><p>INTERNAL / EXPERIMENTAL WORKBENCH</p><h2 id="auto-analysis-title">Auto analysis</h2><span>Independent browser-side layers. Failure in one module does not block temporal annotation.</span></div><div className={styles.autoRun}><fieldset><legend>Density</legend>{(["FAST","FULL"] as const).map((item) => <label key={item}><input checked={mode === item} name="analysis-mode" onChange={() => setMode(item)} type="radio" />{item}</label>)}</fieldset><button disabled={running || !episodeId} onClick={runAnalysis} type="button">{running ? "ANALYSIS RUNNING" : analysisAttempted&&mask&&toolSeed ? "RE-RUN TRACKING FROM CURRENT SEEDS" : "RUN AUTO ANALYSIS"}</button></div></header>
    <div className={temporalStyles.readiness} aria-label="Analysis readiness"><div><span>GARMENT</span><strong data-ready={Boolean(mask)}>{mask?"seeded":"not seeded"}</strong></div><div><span>IRON</span><strong data-ready={Boolean(toolSeed)}>{toolSeed?"initialized":"not initialized"}</strong></div>{analysisAttempted?<><div><span>GARMENT MASK TRACKING</span><strong data-ready={maskTracks.length>0}>{maskTracks.length} propagated records</strong>{mask&&!maskTracks.length?<small>Seed exists, but tracking did not propagate.</small>:null}</div><div><span>IRON TRACKING</span><strong data-ready={toolTracks.length>0}>{toolTracks.length} auto-tracked records</strong>{toolSeed&&!toolTracks.length?<small>Seed exists, but tracking did not propagate.</small>:null}</div></>:null}</div>
    <p className={styles.analysisNotice} role="status">{notice}</p>
    <div className={styles.moduleStatus}>{MODULES.map((name) => <div key={name}><span>{name}</span><strong data-status={statuses[name]}>{formatStatus(statuses[name])}</strong></div>)}</div>
    <section className={styles.temporalAutomation} aria-labelledby="temporal-review-title"><div className={styles.analysisSubhead}><div><p>INTERPRETABLE TEMPORAL PROPOSALS</p><h3 id="temporal-review-title">Temporal review</h3><span>Automation proposes intervals. Only an explicit human acceptance adds a verified annotation.</span></div><button disabled={!analysisReady || !fps} onClick={generateCandidates} type="button">{missingTemporalContext.length?"GENERATE WITH LIMITED CONTEXT":"GENERATE TEMPORAL CANDIDATES"}</button></div>
      <div className={styles.trackLegend}>{Object.entries({"EPISODE STATE":["initial_state","terminal_state"],"HUMAN BEHAVIOUR":["approach","position","tension","iron_stroke","iron_hold","reposition","inspect","release"],INTERACTION:["anchor"],"FABRIC RESPONSE":["slip"]}).map(([track,labels])=><div key={track}><strong>{track}</strong><span>{labels.join(" · ")}</span></div>)}</div>
      {analysisReady?<div className={missingTemporalContext.length?temporalStyles.limitedContext:temporalStyles.fullContext}><strong>{missingTemporalContext.length?"LIMITED CONTEXT":"FULL INTERACTION CONTEXT"}</strong><span>{missingTemporalContext.length?`Missing ${missingTemporalContext.join(" and ")}. Generation will rely primarily on motion and hand evidence.`:`Used ${maskTracks.length} propagated garment-mask records and ${toolTracks.length} auto-tracked iron records.`}</span></div>:null}
      {temporalCandidates.length?<><div className={temporalStyles.coverageSummary}><span>Episode duration <b>{duration.toFixed(3)} sec</b></span><span>Human behaviour candidate coverage <b>{temporalCoverage.humanCoveragePercent.toFixed(1)}%</b></span><span>Interaction candidate coverage <b>{temporalCoverage.interactionCoveragePercent.toFixed(1)}%</b></span><span>Fabric response coverage <b>event-based</b></span><span>Episode state coverage <b>{temporalCoverage.episodeStateCoveragePercent.toFixed(1)}%</b></span><span>Unclassified human-behaviour time <b>{temporalCoverage.unclassifiedHumanSeconds.toFixed(3)} sec</b></span></div><div aria-label="Full-episode temporal candidate timeline" className={temporalStyles.candidateTimeline}>{(["EPISODE STATE","HUMAN BEHAVIOUR","INTERACTION","FABRIC RESPONSE"] as const).map((track)=><div className={temporalStyles.candidateTrack} key={track}><strong>{track}</strong><div>{track==="HUMAN BEHAVIOUR"?temporalCoverage.humanGaps.map((gap,index)=><span className={temporalStyles.unclassifiedInterval} key={`gap-${index}`} style={{left:`${gap.start/duration*100}%`,width:`${(gap.end-gap.start)/duration*100}%`}} title={`UNCLASSIFIED / NO CANDIDATE ${gap.start.toFixed(3)}–${gap.end.toFixed(3)} sec`}/>):null}{temporalCandidates.filter((item)=>item.track===track&&item.review_status!=="rejected").map((item)=><button className={temporalStyles.candidateInterval} key={item.candidate_id} onClick={()=>jumpTo(item.start_time_sec)} style={{left:`${item.start_time_sec/duration*100}%`,width:`${Math.max(.35,(item.end_time_sec-item.start_time_sec)/duration*100)}%`}} title={`${item.proposed_label} ${item.start_time_sec.toFixed(3)}–${item.end_time_sec.toFixed(3)} sec`} type="button"><span>{item.proposed_label}</span></button>)}</div></div>)}</div><p className={temporalStyles.unclassifiedKey}><i/> UNCLASSIFIED / NO CANDIDATE — review-only gap; not an ontology label or CSV value.</p></>:null}
      {temporalCandidates.length ? <ol className={styles.temporalReviewQueue}>{temporalCandidates.map((item)=><li data-review={item.review_status} key={item.candidate_id}><div className={styles.candidateIdentity}><span>{item.track}</span><strong>{item.proposed_label}</strong><small>{item.candidate_id} · {item.review_status}</small></div><div className={styles.candidateEvidence}><b>{item.start_time_sec.toFixed(3)}–{item.end_time_sec.toFixed(3)} sec · {item.duration_sec.toFixed(3)} sec</b><span>{item.candidate_score===null?"No score":`candidate score ${item.candidate_score.toFixed(3)}`}</span><p>{item.evidence}</p></div>{adjustingCandidate===item.candidate_id?<div className={styles.candidateAdjust}><label>Start time<input min="0" max={duration} step="0.001" type="number" value={item.start_time_sec} onChange={(event)=>updateCandidate(item.candidate_id,{start_time_sec:Number(event.target.value)})}/></label><label>End time<input min="0" max={duration} step="0.001" type="number" value={item.end_time_sec} onChange={(event)=>updateCandidate(item.candidate_id,{end_time_sec:Number(event.target.value)})}/></label><label>Label<select value={item.proposed_label} onChange={(event)=>updateCandidate(item.candidate_id,{proposed_label:event.target.value as CandidateLabel,track:TEMPORAL_TRACKS[acceptedLabel(event.target.value as CandidateLabel)]})}><option value="inspect_candidate">inspect_candidate</option>{Object.keys(TEMPORAL_TRACKS).map((label)=><option key={label}>{label}</option>)}</select></label><button onClick={()=>saveAdjustment(item)} type="button">Save adjustment</button></div>:<div className={styles.candidateActions}><button onClick={()=>jumpTo(item.start_time_sec)} type="button">Jump</button><button disabled={!["candidate","adjusted"].includes(item.review_status)} onClick={()=>acceptCandidate(item.candidate_id)} type="button">Accept</button><button disabled={item.review_status!=="candidate"} onClick={()=>rejectCandidate(item.candidate_id)} type="button">Reject</button><button disabled={item.review_status==="accepted"||item.review_status==="rejected"} onClick={()=>setAdjustingCandidate(item.candidate_id)} type="button">Adjust</button>{(item.candidate_score??0)>=.75&&item.review_status==="candidate"?<button onClick={()=>acceptHighConfidenceForLabel(item.proposed_label)} type="button">Accept high-score {item.proposed_label}</button>:null}</div>}</li>)}</ol>:<p className={styles.reviewEmpty}>Run Auto Analysis, seed the garment and iron where needed, then generate temporal candidates. Nothing is generated or accepted automatically.</p>}
    </section>
    <div className={styles.analysisColumns}><section><div className={styles.analysisSubhead}><div><p>SEMANTIC + TRACKING SEED</p><h3>Source-pixel inspection</h3></div><button disabled={!episodeId} onClick={captureReviewFrame} type="button">Capture current frame</button></div><p className={styles.analysisHelp}>Capture a frame, choose an interaction, then click. MediaPipe loads only when analysis or garment segmentation is requested.</p><label className={styles.semanticSelect}>Interaction<select onChange={(event) => setInteractionMode(event.target.value as InteractionMode)} value={interactionMode}><option value="landmark">Place landmark</option><option value="garment">Seed / reseed garment mask</option><option value="iron">Initialize / reinitialize iron</option></select></label>{interactionMode === "landmark" && <label className={styles.semanticSelect}>Landmark<select onChange={(event) => setPointLabel(event.target.value as PointLabel)} value={pointLabel}>{POINT_LABELS.map((label) => <option key={label}>{label}</option>)}</select></label>}<canvas aria-label="Semantic landmark and tracking seed frame" className={styles.semanticCanvas} hidden={!frameImage} onClick={addPoint} ref={canvasRef} /><div className={styles.semanticActions}><button disabled={!activeRegion || !episodeId} onClick={addRegion} type="button">Record active region</button><button disabled={!semantics.length} onClick={() => setSemantics([])} type="button">Clear semantic records</button></div><p className={styles.analysisHelp}>Mask: {mask ? `${mask.width}×${mask.height}, ${mask.source_type}` : "not seeded"}. Hands: {hands.length} detections. Pose-support samples: {poseSamples}. Tool: {toolTracks.length} tracked positions. Model proposals and tracked outputs remain reviewable estimates.</p></section>
      <section><div className={styles.analysisSubhead}><div><p>CONSOLIDATED REVIEW</p><h3>Review required</h3></div><strong>{slips.filter((item) => item.review_status === "candidate").length + maskTracks.filter((item) => item.tracking_status === "review_required").length + toolTracks.filter((item) => item.tracking_status === "review_required").length}</strong></div>{slips.length ? <ol className={styles.reviewQueue}>{slips.map((item,index) => <li key={`${item.start_frame}-${index}`}><div><strong>{item.event_label}</strong><span>{item.start_time_sec.toFixed(3)}–{item.end_time_sec.toFixed(3)} sec · frames {item.start_frame}–{item.end_frame}</span><small>{item.evidence}</small></div><div><button onClick={() => jumpTo(item.start_time_sec)} type="button">Jump</button><button disabled={item.review_status !== "candidate"} onClick={() => reviewSlip(index,"accepted")} type="button">Accept</button><button disabled={item.review_status !== "candidate"} onClick={() => reviewSlip(index,"rejected")} type="button">Reject</button></div></li>)}</ol> : <p className={styles.reviewEmpty}>No automatic review items yet. Run analysis to generate interpretable candidates.</p>}<div className={styles.analysisSummary}><span>RGB samples <b>{rgbScores.length}</b></span><span>Mask tracks <b>{maskTracks.length}</b></span><span>Slip candidates <b>{slips.length}</b></span><span>Accepted slip <b>{activeSlips.filter((item) => item.event_label === "slip").length}</b></span></div></section></div>
    <div className={temporalStyles.preExportContext}><div><strong>INTERACTION CONTEXT</strong><span>Authoritative analysis revision {interactionContext.revision}</span></div><div><span>Garment mask records</span><b>{maskTracks.length}</b></div><div><span>Iron auto-track records</span><b>{toolTracks.length}</b></div><div><span>Temporal context</span><b>{interactionContext.contextLevel}</b></div></div>
    {exportValidation?<p className={temporalStyles.exportError} role="alert">{exportValidation}</p>:null}
    <div className={styles.exportDeck}><div><p>EXPERIMENTAL OUTPUTS</p><h3>Export only what exists</h3><span>Canonical temporal CSV remains nine columns and excludes unaccepted candidates.</span></div><button disabled={!temporalCandidates.length} onClick={() => downloadBlob(`${episodeId}_temporal_candidates.csv`,new Blob([temporalCandidateCsv()],{type:"text/csv"}))} type="button">Export temporal candidates CSV</button><button disabled={!semantics.length} onClick={() => downloadBlob(`${episodeId}_semantics.csv`, new Blob([semanticCsv()], { type: "text/csv" }))} type="button">Export semantic CSV</button><button disabled={!hands.length} onClick={() => downloadBlob(`${episodeId}_hands.csv`, new Blob([handCsv()], { type: "text/csv" }))} type="button">Export hand-pose CSV</button><button disabled={!toolSeed && !toolTracks.length} onClick={() => downloadBlob(`${episodeId}_tool_track.csv`, new Blob([toolCsv()], { type: "text/csv" }))} type="button">Export tool-track CSV</button><button disabled={!slips.length} onClick={() => downloadBlob(`${episodeId}_slip.csv`, new Blob([slipCsv()], { type: "text/csv" }))} type="button">Export slip CSV</button><button disabled title="Depth is unavailable in this deployment." type="button">Export depth metadata</button><button disabled={!episodeId} onClick={() => downloadBlob(`${episodeId}_provenance.json`, new Blob([provenanceJson()], { type: "application/json" }))} type="button">Export provenance</button><button disabled={!episodeId || videoExporting} onClick={exportVideo} type="button">{videoExporting ? "Rendering video" : "Export analysis video"}</button><button disabled={!episodeId} onClick={exportPackage} type="button">Export episode package</button></div>
    <p className={styles.analysisHelp}>MediaPipe Tasks Vision {MEDIAPIPE_VERSION}; Hand Landmarker, Pose Landmarker, and Interactive Segmenter models load remotely from Google-hosted assets. Model URLs are recorded in provenance: {Object.keys(MEDIAPIPE_MODELS).join(", ")}.</p>
    <div className={styles.scienceCaveat}><strong>Scientific status</strong><span>Optical flow is image motion, not calibrated physical velocity.</span><span>Slip candidates are not verified slip until accepted by a human.</span><span>RGB response is experimental: not ground truth, physical wrinkle height, or measured geometry.</span><span>Depth not available in current deployment. Estimated 3D unavailable without depth.</span></div>
  </section>;
}
