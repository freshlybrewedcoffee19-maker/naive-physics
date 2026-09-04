"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "../site-header";
import { IRONING_EPISODES, readEpisodeField } from "../data/ironing-episodes";
import { AutoAnalysis } from "./auto-analysis";
import styles from "./annotate.module.css";
import { RgbAnalysis } from "./rgb-analysis";

const sampleEpisode = IRONING_EPISODES[0];

const BEHAVIORS = [
  ["initial_state", "Garment stationary before active manipulation.", false],
  ["approach", "Hand or tool moves toward the target/workspace before interaction.", false],
  ["position", "Garment is moved or aligned into a working configuration.", false],
  ["tension", "Fabric is held, pulled or stabilized to create/control tension.", false],
  ["iron_stroke", "Iron contacts fabric while translating across it.", false],
  ["iron_hold", "Iron remains in contact with fabric with little or no translational movement.", false],
  ["reposition", "Garment or tool configuration changes between active ironing interactions.", false],
  ["inspect", "Operator checks the garment/result without active ironing.", false],
  ["release", "Active contact/manipulation ends.", false],
  ["terminal_state", "Garment remains stationary after manipulation is complete.", false],
  ["anchor", "The non-ironing hand holds or stabilizes the fabric to resist movement during manipulation.", true],
  ["slip", "A visible moment or interval where one fabric region/layer moves relative to another during interaction.", true],
] as const;

const MODULES = [
  ["Temporal", "Available"],
  ["RGB Analysis", "Available"],
  ["Depth", "Future"],
  ["3D", "Future"],
  ["Thermal", "Sensor required"],
] as const;

type ActiveModule = "Temporal" | "RGB Analysis";

const CONTROLLED_OPTIONS = {
  garment_type: ["t_shirt", "formal_shirt", "trousers", "fabric_piece", "other"],
  material: ["cotton", "linen", "polyester", "denim", "silk", "blend", "unknown", "other"],
  task: ["wrinkle_removal", "folding", "hanging", "sorting", "packing", "other"],
  action: ["ironing", "folding", "grasping", "placing", "repositioning", "other"],
  camera_view: ["top_down", "oblique", "egocentric", "side", "other"],
  camera_motion: ["fixed", "moving", "other"],
} as const;

const REGION_OPTIONS = ["front_body", "back_body", "left_sleeve", "right_sleeve", "both_sleeves", "collar", "left_cuff", "right_cuff", "both_cuffs", "waistband", "leg", "other"] as const;
const SESSION_FIELDS = Object.keys(CONTROLLED_OPTIONS) as Array<keyof typeof CONTROLLED_OPTIONS>;

const EMPTY_METADATA = {
  episode_id: "",
  garment_type: "",
  garment_region: "",
  material: "",
  task: "",
  action: "",
  camera_view: "",
  camera_motion: "",
  frame_rate_fps: "",
};

type Behavior = (typeof BEHAVIORS)[number][0];
type MetadataState = typeof EMPTY_METADATA;
type SessionField = (typeof SESSION_FIELDS)[number];
type Provenance = "AUTO-DETECTED" | "FILENAME-DERIVED" | "SESSION DEFAULT" | "MANUAL" | "VERIFIED SAMPLE";
type ProvenanceState = Partial<Record<keyof MetadataState, Provenance>>;
type SessionDefault = { choice: string; custom: string; locked: boolean };
type SessionDefaults = Record<SessionField, SessionDefault>;
type MediaFacts = {
  file_name: string;
  file_size_bytes: number | null;
  mime_type: string;
  duration_seconds: number | null;
  frame_width_px: number | null;
  frame_height_px: number | null;
};
type VideoSource = { kind: "local" | "sample"; name: string; url: string } | null;
type Annotation = {
  episode_id: string;
  annotation_id: string;
  label: Behavior;
  start_time_sec: number;
  end_time_sec: number;
  start_frame: number | null;
  end_frame: number | null;
  duration_sec: number;
  annotation_source: "human_annotated";
};
type TemporalInterval = { start: number; end: number; duration: number };
type TemporalQa = {
  annotatedDuration: number;
  unannotatedDuration: number;
  coveragePercentage: number;
  gaps: TemporalInterval[];
  overlaps: TemporalInterval[];
  passed: boolean;
};

const roundTime = (value: number) => Math.round(value * 1000) / 1000;
const TEMPORAL_TOLERANCE_SECONDS = 0.001;
const frameFromTime = (time: number, fps: number | null) => fps ? Math.round(time * fps) : null;
const emptySessionDefaults = () => Object.fromEntries(SESSION_FIELDS.map((field) => [field, { choice: "", custom: "", locked: false }])) as SessionDefaults;
const emptyMediaFacts = (): MediaFacts => ({ file_name: "", file_size_bytes: null, mime_type: "", duration_seconds: null, frame_width_px: null, frame_height_px: null });
const parseEpisodeId = (fileName: string) => fileName.match(/^(IRON_\d{3})_action\.(?:mp4|mov|webm)$/i)?.[1].toUpperCase() ?? "";
const selectedValue = (value: string, options: readonly string[]) => options.includes(value) ? value : value ? "other" : "";
const resolvedDefault = (entry: SessionDefault) => entry.choice === "other" ? entry.custom.trim() : entry.choice;
const formatBytes = (bytes: number | null) => bytes === null ? "Not available" : bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1_000)} KB`;
const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const formatDuration = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};
const analyzeTemporalTrack = (annotations: Annotation[], episodeDuration: number): TemporalQa => {
  if (!(episodeDuration > 0)) return { annotatedDuration: 0, unannotatedDuration: 0, coveragePercentage: 0, gaps: [], overlaps: [], passed: false };
  const sorted = [...annotations].sort((a, b) => a.start_time_sec - b.start_time_sec || a.end_time_sec - b.end_time_sec);
  const gaps: TemporalInterval[] = [];
  const overlaps: TemporalInterval[] = [];
  let frontier = 0;
  let covered = 0;
  let hasSegment = false;

  for (const annotation of sorted) {
    const start = Math.max(0, Math.min(episodeDuration, annotation.start_time_sec));
    const end = Math.max(start, Math.min(episodeDuration, annotation.end_time_sec));
    if (hasSegment && start > frontier + TEMPORAL_TOLERANCE_SECONDS) gaps.push({ start: frontier, end: start, duration: roundTime(start - frontier) });
    if (hasSegment && start < frontier - TEMPORAL_TOLERANCE_SECONDS && end > start) {
      const overlapEnd = Math.min(frontier, end);
      overlaps.push({ start, end: overlapEnd, duration: roundTime(overlapEnd - start) });
    }
    const uncoveredStart = Math.max(frontier, start);
    if (end > uncoveredStart) covered += end - uncoveredStart;
    frontier = Math.max(frontier, end);
    hasSegment = true;
  }
  const annotatedDuration = roundTime(Math.min(episodeDuration, covered));
  const rawUnannotated = Math.max(0, episodeDuration - annotatedDuration);
  const unannotatedDuration = rawUnannotated <= TEMPORAL_TOLERANCE_SECONDS ? 0 : roundTime(rawUnannotated);
  const coveragePercentage = Math.min(100, Math.max(0, episodeDuration ? annotatedDuration / episodeDuration * 100 : 0));
  return { annotatedDuration, unannotatedDuration, coveragePercentage, gaps, overlaps, passed: annotations.length > 0 && unannotatedDuration === 0 && gaps.length === 0 && overlaps.length === 0 };
};

export function TemporalWorkbench() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextAnnotationNumber = useRef(1);
  const [source, setSource] = useState<VideoSource>(null);
  const [metadata, setMetadata] = useState<MetadataState>(EMPTY_METADATA);
  const [metadataProvenance, setMetadataProvenance] = useState<ProvenanceState>({});
  const [mediaFacts, setMediaFacts] = useState<MediaFacts>(emptyMediaFacts);
  const [sessionDefaults, setSessionDefaults] = useState<SessionDefaults>(emptySessionDefaults);
  const [customFields, setCustomFields] = useState<Partial<Record<SessionField | "garment_region", boolean>>>({});
  const [duration, setDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [behavior, setBehavior] = useState<Behavior | "">("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validation, setValidation] = useState("");
  const [annotationsExported, setAnnotationsExported] = useState(false);
  const [activeModule, setActiveModule] = useState<ActiveModule>("Temporal");
  const [exportNotice, setExportNotice] = useState("");

  const fpsValue = Number(metadata.frame_rate_fps);
  const fps = Number.isFinite(fpsValue) && fpsValue > 0 ? fpsValue : null;
  const currentFrame = frameFromTime(currentTime, fps);

  const resetAnnotationState = useCallback(() => {
    setCurrentTime(0);
    setStartTime(null);
    setEndTime(null);
    setBehavior("");
    setAnnotations([]);
    setSelectedId(null);
    setValidation("");
    setAnnotationsExported(false);
    setExportNotice("");
    nextAnnotationNumber.current = 1;
  }, []);

  const approveSourceChange = () => annotations.length === 0 || annotationsExported || window.confirm("This annotation session has not been exported. Selecting another video will clear it. Continue?");

  const releaseLocalVideo = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const inheritedSessionValues = () => {
    const values: Partial<MetadataState> = {};
    const provenance: ProvenanceState = {};
    for (const field of SESSION_FIELDS) {
      const entry = sessionDefaults[field];
      const value = resolvedDefault(entry);
      if (entry.locked && value) {
        values[field] = value;
        provenance[field] = "SESSION DEFAULT";
      }
    }
    return { values, provenance };
  };

  const activateSource = (nextSource: Exclude<VideoSource, null>, nextMetadata: MetadataState, provenance: ProvenanceState, facts: MediaFacts) => {
    releaseLocalVideo();
    setSource(nextSource);
    setMetadata(nextMetadata);
    setMetadataProvenance(provenance);
    setCustomFields({});
    setMediaFacts(facts);
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    resetAnnotationState();
  };

  const loadSample = () => {
    if (!approveSourceChange()) return;
    const { values: inheritedValues, provenance: inheritedProvenance } = inheritedSessionValues();
    activateSource(
      { kind: "sample", name: "IRON_001_action.mp4", url: sampleEpisode.videoPath },
      {
        episode_id: String(readEpisodeField(sampleEpisode, "episode_id") ?? ""),
        garment_type: String(inheritedValues.garment_type ?? readEpisodeField(sampleEpisode, "garment_type") ?? ""),
        garment_region: String(readEpisodeField(sampleEpisode, "garment_region") ?? ""),
        material: String(inheritedValues.material ?? readEpisodeField(sampleEpisode, "material") ?? ""),
        task: String(inheritedValues.task ?? readEpisodeField(sampleEpisode, "task") ?? ""),
        action: String(inheritedValues.action ?? readEpisodeField(sampleEpisode, "action") ?? ""),
        camera_view: String(inheritedValues.camera_view ?? readEpisodeField(sampleEpisode, "camera_view") ?? ""),
        camera_motion: String(inheritedValues.camera_motion ?? readEpisodeField(sampleEpisode, "camera_motion") ?? ""),
        frame_rate_fps: String(readEpisodeField(sampleEpisode, "frame_rate_fps") ?? ""),
      },
      {
        episode_id: "FILENAME-DERIVED",
        garment_region: "VERIFIED SAMPLE",
        frame_rate_fps: "VERIFIED SAMPLE",
        ...Object.fromEntries(SESSION_FIELDS.map((field) => [field, inheritedProvenance[field] ?? "VERIFIED SAMPLE"])),
      },
      { file_name: "IRON_001_action.mp4", file_size_bytes: null, mime_type: "video/mp4", duration_seconds: null, frame_width_px: null, frame_height_px: null },
    );
  };

  const handleVideoSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!approveSourceChange()) {
      event.target.value = "";
      return;
    }
    releaseLocalVideo();
    const url = URL.createObjectURL(file);
    const episodeId = parseEpisodeId(file.name);
    const { values: inheritedValues, provenance: inheritedProvenance } = inheritedSessionValues();
    objectUrlRef.current = url;
    setSource({ kind: "local", name: file.name, url });
    setMetadata({ ...EMPTY_METADATA, ...inheritedValues, episode_id: episodeId });
    setMetadataProvenance({ ...inheritedProvenance, ...(episodeId ? { episode_id: "FILENAME-DERIVED" as const } : {}) });
    setCustomFields({});
    setMediaFacts({ file_name: file.name, file_size_bytes: file.size, mime_type: file.type || "Not reported", duration_seconds: null, frame_width_px: null, frame_height_px: null });
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    resetAnnotationState();
    event.target.value = "";
  };

  const captureCurrentTime = useCallback(() => roundTime(videoRef.current?.currentTime ?? currentTime), [currentTime]);
  const markStart = useCallback(() => { setStartTime(captureCurrentTime()); setValidation(""); }, [captureCurrentTime]);
  const markEnd = useCallback(() => { setEndTime(captureCurrentTime()); setValidation(""); }, [captureCurrentTime]);
  const togglePlayback = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play(); else video.pause();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.matches("input, textarea, select, button, a, [contenteditable='true']")) return;
      if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
      if (event.key === "[") { event.preventDefault(); markStart(); }
      if (event.key === "]") { event.preventDefault(); markEnd(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [markEnd, markStart, togglePlayback]);

  const updateMetadata = (field: keyof MetadataState, value: string) => {
    setMetadata((current) => ({ ...current, [field]: value }));
    setMetadataProvenance((current) => ({ ...current, [field]: "MANUAL" }));
    if (field === "episode_id") {
      setAnnotations((current) => current.map((annotation) => ({ ...annotation, episode_id: value.trim() })));
    }
    if (field === "frame_rate_fps") {
      const parsedFps = Number(value);
      const nextFps = Number.isFinite(parsedFps) && parsedFps > 0 ? parsedFps : null;
      setAnnotations((current) => current.map((annotation) => ({
        ...annotation,
        start_frame: frameFromTime(annotation.start_time_sec, nextFps),
        end_frame: frameFromTime(annotation.end_time_sec, nextFps),
      })));
    }
    if ((field === "episode_id" || field === "frame_rate_fps") && annotations.length > 0) setAnnotationsExported(false);
    setValidation("");
  };

  const updateControlledMetadata = (field: SessionField | "garment_region", choice: string) => {
    setCustomFields((current) => ({ ...current, [field]: choice === "other" }));
    updateMetadata(field, choice === "other" ? "" : choice);
  };

  const updateSessionDefault = (field: SessionField, update: Partial<SessionDefault>) => {
    setSessionDefaults((current) => ({ ...current, [field]: { ...current[field], ...update } }));
  };

  const resetForNextVideo = () => {
    if (!approveSourceChange()) return;
    releaseLocalVideo();
    setSource(null);
    setMetadata(EMPTY_METADATA);
    setMetadataProvenance({});
    setCustomFields({});
    setMediaFacts(emptyMediaFacts());
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    resetAnnotationState();
    fileInputRef.current?.focus();
  };

  const addSegment = () => {
    if (!source) { setValidation("Choose a local video or load the sample episode first."); return; }
    if (!metadata.episode_id.trim()) { setValidation("Episode ID is required before adding a segment."); return; }
    if (startTime === null) { setValidation("Mark a segment start before adding it."); return; }
    if (endTime === null) { setValidation("Mark a segment end before adding it."); return; }
    if (!behavior) { setValidation("Choose a behavior before adding the segment."); return; }
    if (endTime <= startTime) { setValidation("End time must be later than start time."); return; }
    const annotation: Annotation = {
      episode_id: metadata.episode_id.trim(),
      annotation_id: `ANN_${String(nextAnnotationNumber.current).padStart(3, "0")}`,
      label: behavior,
      start_time_sec: startTime,
      end_time_sec: endTime,
      start_frame: frameFromTime(startTime, fps),
      end_frame: frameFromTime(endTime, fps),
      duration_sec: roundTime(endTime - startTime),
      annotation_source: "human_annotated",
    };
    nextAnnotationNumber.current += 1;
    setAnnotations((current) => [...current, annotation]);
    setAnnotationsExported(false);
    setExportNotice("");
    setSelectedId(annotation.annotation_id);
    setStartTime(null);
    setEndTime(null);
    setBehavior("");
    setValidation("");
  };

  const selectAnnotation = (annotation: Annotation) => {
    setSelectedId(annotation.annotation_id);
    const video = videoRef.current;
    if (video) {
      video.currentTime = annotation.start_time_sec;
      setCurrentTime(annotation.start_time_sec);
    }
  };

  const deleteAnnotation = (annotationId: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.annotation_id !== annotationId));
    setSelectedId((current) => current === annotationId ? null : current);
    setAnnotationsExported(false);
    setExportNotice("");
  };

  const exportCsv = () => {
    if (!metadata.episode_id.trim()) {
      setValidation("Episode ID is required before export.");
      return;
    }
    const columns = ["episode_id","annotation_id","label","start_time_sec","end_time_sec","start_frame","end_frame","duration_sec","annotation_source"] as const;
    const canonicalAnnotations = [...annotations]
      .sort((a, b) => a.start_time_sec - b.start_time_sec || a.end_time_sec - b.end_time_sec)
      .map((annotation, index) => ({ ...annotation, annotation_id: `ANN_${String(index + 1).padStart(3, "0")}` }));
    const rows = canonicalAnnotations.map((annotation) => columns.map((column) => {
      const value = annotation[column];
      if (value === null) return "";
      return typeof value === "number" && (column.includes("time") || column === "duration_sec") ? value.toFixed(3) : String(value);
    }));
    const csv = [columns, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${metadata.episode_id.trim()}_annotations.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setAnnotationsExported(true);
    setExportNotice(temporalQa.passed ? "TEMPORAL QA PASSED" : "TEMPORAL QA INCOMPLETE — export created with warnings.");
  };

  const exportMetadataCsv = () => {
    if (!source || !metadata.episode_id.trim()) {
      setValidation("Episode ID and a video are required before metadata export.");
      return;
    }
    const columns = ["episode_id","file_name","file_size_bytes","mime_type","garment_type","garment_region","material","task","action","camera_view","camera_motion","duration_seconds","frame_width_px","frame_height_px","frame_rate_fps"] as const;
    const row = [
      metadata.episode_id.trim(), mediaFacts.file_name, mediaFacts.file_size_bytes, mediaFacts.mime_type,
      metadata.garment_type, metadata.garment_region, metadata.material, metadata.task, metadata.action,
      metadata.camera_view, metadata.camera_motion, mediaFacts.duration_seconds, mediaFacts.frame_width_px,
      mediaFacts.frame_height_px, fps,
    ];
    const csv = [columns, row].map((values) => values.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${metadata.episode_id.trim()}_metadata.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const formatMark = (time: number | null) => {
    if (time === null) return "Not marked";
    const frame = frameFromTime(time, fps);
    return `${time.toFixed(2)} s / ${frame === null ? "FPS REQUIRED" : `frame ${frame}`}`;
  };

  const proposedDuration = startTime !== null && endTime !== null ? roundTime(endTime - startTime) : null;
  const safeDuration = duration > 0 ? duration : 1;
  const ticks = [0, .25, .5, .75, 1].map((portion) => duration * portion);
  const temporalQa = analyzeTemporalTrack(annotations, duration);
  const startEpisodeAtZero = () => {
    setStartTime(0);
    setValidation("");
    const video = videoRef.current;
    if (video) { video.currentTime = 0; setCurrentTime(0); }
  };
  const startAtPreviousEnd = () => {
    if (!annotations.length) return;
    const previousEnd = [...annotations].sort((a, b) => a.start_time_sec - b.start_time_sec || a.end_time_sec - b.end_time_sec).at(-1)?.end_time_sec;
    if (previousEnd === undefined) return;
    setStartTime(previousEnd);
    setValidation("");
    const video = videoRef.current;
    if (video) { video.currentTime = previousEnd; setCurrentTime(previousEnd); }
  };

  return <>
    <SiteHeader active="annotate" />
    <div className={styles.toolContext}>
      <div><span>nAIve physics</span><strong>Internal / Experimental Workbench</strong></div>
      <div><span>{activeModule}</span><strong>{activeModule === "Temporal" ? "v0.2.1" : "v0.3A"}</strong></div>
    </div>
    <nav className={styles.moduleNav} aria-label="Data Workbench modules">
      {MODULES.map(([module, status], index) => <button aria-current={activeModule === module ? "page" : undefined} disabled={index > 1} key={module} onClick={() => index < 2 && setActiveModule(module as ActiveModule)} title={module === "Thermal" ? "Requires thermal / IR sensor data." : undefined} type="button">{module}<span>{activeModule === module ? "Active" : status}</span></button>)}
    </nav>
    <ol className={styles.workflow} aria-label="Batch annotation workflow">{["Upload","Verify metadata","Annotate","Export","Next video"].map((step,index)=><li className={index === 0 && !source ? styles.workflowActive : source && index === 1 ? styles.workflowActive : ""} key={step}><span>{index+1}</span>{step}</li>)}</ol>
    <main className={styles.workbench}>
      <section className={styles.episodeHead}>
        <div><p>FREE TOOL / DATA WORKBENCH</p><h1>{activeModule === "Temporal" ? "Turn video into temporal data." : "Inspect RGB frame structure."}</h1><span>{activeModule === "Temporal" ? "Convert manipulation video into human-verified temporal data." : "Derive an inspectable wrinkle / crease proxy from a human-selected garment region."}</span></div>
        <div className={styles.provenance}><strong>{activeModule === "Temporal" ? "Temporal behavior" : "RGB analysis"}</strong><p>Source: <b>{activeModule === "Temporal" ? "Human annotated" : "Sensor captured RGB"}</b></p><p>{activeModule === "Temporal" ? "Frame index" : "Analysis"}: <b>{activeModule === "Temporal" ? "Derived from timestamp × FPS" : "Derived from RGB / experimental"}</b></p></div>
      </section>

      <section className={styles.sourceSetup} aria-labelledby="source-title">
        <div className={styles.sourceIntro}><p>01 / VIDEO INPUT</p><h2 id="source-title">Choose a manipulation video.</h2><p>The selected file stays in this browser session. It is not automatically added to the nAIve physics commercial dataset.</p></div>
        <div className={styles.sourceActions}>
          <input accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className={styles.fileInput} id="video-upload" onChange={handleVideoSelection} ref={fileInputRef} type="file" />
          <label className={styles.uploadButton} htmlFor="video-upload">Upload video <span>MP4 · MOV · WEBM</span></label>
          <button className={styles.sampleButton} onClick={loadSample} type="button">Try with sample episode <span>IRON_001</span></button>
        </div>
      </section>

      <section className={styles.mediaSummary} aria-labelledby="media-title">
        <div className={styles.sectionHead}><div><p>02 / AUTO CAPTURE</p><h2 id="media-title">Source file</h2></div><span>{source ? "Browser-readable metadata" : "Awaiting video"}</span></div>
        <div className={styles.mediaLedger}>
          <div><span>File name</span><strong>{mediaFacts.file_name || "No file selected"}</strong><small>AUTO-DETECTED</small></div>
          <div><span>File size</span><strong>{formatBytes(mediaFacts.file_size_bytes)}</strong><small>{mediaFacts.file_size_bytes === null ? "NOT AVAILABLE" : "AUTO-DETECTED"}</small></div>
          <div><span>Resolution</span><strong>{mediaFacts.frame_width_px && mediaFacts.frame_height_px ? `${mediaFacts.frame_width_px} × ${mediaFacts.frame_height_px}` : "Awaiting metadata"}</strong><small>AUTO-DETECTED</small></div>
          <div><span>Duration</span><strong>{mediaFacts.duration_seconds === null ? "Awaiting metadata" : `${mediaFacts.duration_seconds.toFixed(2)} sec`}</strong><small>AUTO-DETECTED</small></div>
          <div><span>MIME type</span><strong>{mediaFacts.mime_type || "Not reported"}</strong><small>AUTO-DETECTED</small></div>
          <div><span>FPS</span><strong>{fps ?? "FPS NOT DETECTED"}</strong><small>{metadataProvenance.frame_rate_fps ?? "MANUAL REQUIRED"}</small></div>
          <div><span>Episode ID</span><strong>{metadata.episode_id || "Episode ID not detected"}</strong><small>{metadataProvenance.episode_id ?? "MANUAL REQUIRED"}</small></div>
        </div>
      </section>

      <section className={styles.metadataSection} aria-labelledby="metadata-title">
        <div className={styles.sectionHead}><div><p>03 / VERIFY METADATA</p><h2 id="metadata-title">Batch metadata</h2></div><span>Locked defaults apply to the next video</span></div>
        <div className={styles.batchMetadata}>
          <div className={styles.sessionDefaults}><div className={styles.panelHeading}><strong>Session defaults</strong><span>Configure once. Lock values to carry them forward.</span></div>{SESSION_FIELDS.map((field)=>{const entry=sessionDefaults[field]; const options=CONTROLLED_OPTIONS[field]; return <div className={styles.defaultRow} key={field}><label>{field}<select aria-label={`Session default ${field}`} onChange={(event)=>updateSessionDefault(field,{choice:event.target.value})} value={entry.choice}><option value="">No default</option>{options.map(option=><option key={option} value={option}>{option}</option>)}</select>{entry.choice==="other"?<input aria-label={`Custom session default ${field}`} onChange={(event)=>updateSessionDefault(field,{custom:event.target.value})} placeholder="Custom value" value={entry.custom}/>:null}</label><button aria-pressed={entry.locked} disabled={!resolvedDefault(entry)} onClick={()=>updateSessionDefault(field,{locked:!entry.locked})} type="button">{entry.locked?"Locked":"Lock"}</button></div>})}<p>Overriding an inherited episode value does not change these defaults.</p></div>
          <div className={styles.episodeMetadata}><div className={styles.panelHeading}><strong>Current episode</strong><span>{source ? `${source.kind} / ${source.name}` : "No video selected"}</span></div>
            <label className={styles.metadataField}>episode_id <b>Required</b><input onChange={(event)=>updateMetadata("episode_id",event.target.value)} placeholder="Episode ID not detected" value={metadata.episode_id}/><small>{metadataProvenance.episode_id ?? "MANUAL REQUIRED"}</small></label>
            {[...SESSION_FIELDS,"garment_region" as const].map((field)=>{const options=field==="garment_region"?REGION_OPTIONS:CONTROLLED_OPTIONS[field]; const isOther=Boolean(customFields[field]) || selectedValue(metadata[field],options)==="other"; return <label className={styles.metadataField} key={field}>{field}<select aria-label={`Episode ${field}`} onChange={(event)=>updateControlledMetadata(field,event.target.value)} value={isOther?"other":selectedValue(metadata[field],options)}><option value="">Choose value</option>{options.map(option=><option key={option} value={option}>{option}</option>)}</select>{isOther?<input aria-label={`Custom episode ${field}`} onChange={(event)=>updateMetadata(field,event.target.value)} placeholder="Custom value" value={metadata[field]}/>:null}<small>{metadataProvenance[field] ?? "NOT SET"}</small></label>})}
            <label className={styles.metadataField}>frame_rate_fps <b>Required for frames</b><input inputMode="decimal" min="0.001" onChange={(event)=>updateMetadata("frame_rate_fps",event.target.value)} placeholder="FPS NOT DETECTED" step="any" type="number" value={metadata.frame_rate_fps}/><small>{metadataProvenance.frame_rate_fps ?? "MANUAL REQUIRED"}</small></label>
          </div>
        </div>
        {!fps ? <p className={styles.fpsNotice}>FPS REQUIRED for frame indices. Time-based annotation remains available.</p> : null}
        <div className={styles.metadataActions}><button disabled={!source || !metadata.episode_id.trim()} onClick={exportMetadataCsv} type="button">Export episode metadata</button></div>
      </section>

      <section className={styles.playerSection} aria-label={`${activeModule} video player`}>
        {source ? <video className={source.kind === "sample" ? styles.samplePortraitVideo : undefined} controls key={source.url} onLoadedMetadata={(event) => { const video = event.currentTarget; const detectedDuration=roundTime(video.duration); setDuration(video.duration); setDimensions({ width: video.videoWidth, height: video.videoHeight }); setMediaFacts((current)=>({...current,duration_seconds:detectedDuration,frame_width_px:video.videoWidth,frame_height_px:video.videoHeight})); setCurrentTime(0); }} onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} preload="metadata" ref={videoRef}><source src={source.url} />Your browser does not support HTML5 video.</video> : <div className={styles.playerEmpty}><strong>No video loaded</strong><span>Upload a local video or try the sample episode.</span></div>}
        <div className={styles.liveReadout}><div><span>Current time</span><strong>{currentTime.toFixed(2)} s</strong></div><div><span>Current frame</span><strong>{currentFrame === null ? "FPS REQUIRED" : String(currentFrame).padStart(4,"0")}</strong></div><div><span>Media</span><strong>{duration ? `${formatDuration(duration)} · ${dimensions.width} × ${dimensions.height}` : "Awaiting metadata"}</strong></div><div><span>Episode</span><strong>{metadata.episode_id || "REQUIRED"}</strong></div></div>
        <div className={styles.shortcuts}><span><kbd>Space</kbd> Play / pause</span>{activeModule === "Temporal" ? <><span><kbd>[</kbd> Mark start</span><span><kbd>]</kbd> Mark end</span></> : <span>Seek, pause, then capture the displayed frame</span>}</div>
      </section>

      <div hidden={activeModule !== "Temporal"}>
        <section className={styles.timelineSection} aria-labelledby="timeline-title"><div className={styles.sectionHead}><div><p>03 / BEHAVIOR TRACK</p><h2 id="timeline-title">Timeline</h2></div><span>00:00 — {formatDuration(duration)}</span></div><div className={styles.temporalMetrics}><div><span>Temporal coverage</span><strong>{temporalQa.annotatedDuration.toFixed(3)} / {duration.toFixed(3)} sec</strong><b>{temporalQa.coveragePercentage.toFixed(1)}%</b></div><div><span>Unannotated</span><strong>{temporalQa.unannotatedDuration.toFixed(3)} sec</strong><b>{temporalQa.gaps.length} gaps</b></div><div><span>Overlap QA</span><strong>{temporalQa.overlaps.length}</strong><b>{temporalQa.overlaps.length ? "REVIEW REQUIRED" : "NONE DETECTED"}</b></div></div><div className={styles.timeline} aria-label="Temporal annotation timeline"><div className={styles.playhead} style={{ left: `${Math.min(100, currentTime / safeDuration * 100)}%` }}/>{temporalQa.gaps.map((gap,index)=><span className={`${styles.qaInterval} ${styles.gapInterval}`} key={`gap-${index}`} style={{left:`${gap.start/safeDuration*100}%`,width:`${gap.duration/safeDuration*100}%`}} title={`Gap ${gap.start.toFixed(3)}–${gap.end.toFixed(3)} sec`} />)}{temporalQa.overlaps.map((overlap,index)=><span className={`${styles.qaInterval} ${styles.overlapInterval}`} key={`overlap-${index}`} style={{left:`${overlap.start/safeDuration*100}%`,width:`${overlap.duration/safeDuration*100}%`}} title={`Overlap ${overlap.start.toFixed(3)}–${overlap.end.toFixed(3)} sec`} />)}{annotations.map((annotation) => <button aria-label={`Select ${annotation.annotation_id} ${annotation.label}`} className={`${styles.segment} ${selectedId === annotation.annotation_id ? styles.segmentSelected : ""}`} key={annotation.annotation_id} onClick={() => selectAnnotation(annotation)} style={{left:`${annotation.start_time_sec / safeDuration * 100}%`,width:`${annotation.duration_sec / safeDuration * 100}%`}} type="button"><span>{annotation.label}</span></button>)}</div><div className={styles.timelineTicks}>{ticks.map((tick, index) => <span key={index}>{tick.toFixed(tick < 10 ? 1 : 0)} s</span>)}</div>{temporalQa.gaps.length || temporalQa.overlaps.length ? <div className={styles.qaIssues}>{temporalQa.gaps.map((gap,index)=><span key={`gap-detail-${index}`}>GAP {gap.start.toFixed(3)}–{gap.end.toFixed(3)} · {gap.duration.toFixed(3)} sec</span>)}{temporalQa.overlaps.map((overlap,index)=><span key={`overlap-detail-${index}`}>OVERLAP {overlap.start.toFixed(3)}–{overlap.end.toFixed(3)} · {overlap.duration.toFixed(3)} sec</span>)}</div> : <p className={styles.qaClear}>No gaps or overlaps detected.</p>}</section>

      <section className={styles.annotationBuilder} aria-labelledby="controls-title"><div className={styles.controlPanel}><div className={styles.sectionHead}><div><p>04 / HUMAN VERIFICATION</p><h2 id="controls-title">Annotation controls</h2></div></div><div className={styles.quickStarts}><button disabled={!source || annotations.length > 0} onClick={startEpisodeAtZero} type="button">Start episode at 0.000</button><button disabled={!source || annotations.length === 0} onClick={startAtPreviousEnd} type="button">Start at previous end</button></div><div className={styles.markButtons}><button disabled={!source} onClick={markStart} type="button">Mark start <kbd>[</kbd></button><button disabled={!source} onClick={markEnd} type="button">Mark end <kbd>]</kbd></button></div><label>Behavior<select onChange={(event) => { setBehavior(event.target.value as Behavior | ""); setValidation(""); }} value={behavior}><option value="">Choose behavior</option>{BEHAVIORS.map(([label,definition,experimental]) => <option key={label} title={definition} value={label}>{label}{experimental ? " — EXPERIMENTAL" : ""}</option>)}</select></label><p className={styles.experimentalNote}>Experimental interaction labels are being evaluated and are not part of the published v0.2 ontology.</p><dl className={styles.proposedSegment}><div><dt>Start</dt><dd>{formatMark(startTime)}</dd></div><div><dt>End</dt><dd>{formatMark(endTime)}</dd></div><div><dt>Duration</dt><dd>{proposedDuration === null ? "—" : `${proposedDuration.toFixed(2)} s`}</dd></div></dl>{validation ? <p className={styles.validation} role="alert">{validation}</p> : null}<button className={styles.addButton} onClick={addSegment} type="button">Add segment</button></div><aside className={styles.ontology}><p>Controlled vocabulary</p>{BEHAVIORS.map(([label,definition,experimental]) => <details key={label}><summary>{label}{experimental ? <b>Experimental</b> : null}</summary><span>{definition}</span></details>)}</aside></section>

      <section className={styles.records} aria-labelledby="records-title">
        <div className={styles.recordsHeader}><div><p>06 / SESSION RECORDS</p><h2 id="records-title">Annotation records</h2></div><div><span>{annotationsExported ? "Annotation CSV exported." : "Annotations are not saved until exported."}</span><div className={styles.recordActions}><button disabled={annotations.length === 0} onClick={exportCsv} type="button">Export annotation CSV</button>{annotationsExported ? <button className={styles.nextButton} onClick={resetForNextVideo} type="button">Annotate next video</button> : null}</div></div></div><div className={`${styles.exportQa} ${temporalQa.passed ? styles.qaPassed : styles.qaIncomplete}`}><strong>{temporalQa.passed ? "TEMPORAL QA PASSED" : "TEMPORAL QA INCOMPLETE"}</strong><span>Segments: {annotations.length}</span><span>Coverage: {temporalQa.coveragePercentage.toFixed(1)}%</span><span>Gaps: {temporalQa.gaps.length}</span><span>Overlaps: {temporalQa.overlaps.length}</span><span>Episode: {duration.toFixed(3)} sec</span>{exportNotice ? <b role="status">{exportNotice}</b> : null}</div>
        {annotations.length === 0 ? <div className={styles.emptyState}><strong>No temporal annotations yet.</strong><p>Choose a video, mark a start and end point, then create the first human-verified behavior segment.</p></div> : <div className={styles.tableWrap}><table><thead><tr><th>ID</th><th>Label</th><th>Start</th><th>End</th><th>Duration</th><th>Start frame</th><th>End frame</th><th>Source</th><th>Actions</th></tr></thead><tbody>{annotations.map((annotation) => <tr className={selectedId === annotation.annotation_id ? styles.selectedRow : ""} key={annotation.annotation_id}><td>{annotation.annotation_id}</td><td>{annotation.label}</td><td>{annotation.start_time_sec.toFixed(3)}</td><td>{annotation.end_time_sec.toFixed(3)}</td><td>{annotation.duration_sec.toFixed(3)}</td><td>{annotation.start_frame ?? "—"}</td><td>{annotation.end_frame ?? "—"}</td><td>{annotation.annotation_source}</td><td><button onClick={() => selectAnnotation(annotation)} type="button">Select</button><button onClick={() => deleteAnnotation(annotation.annotation_id)} type="button">Delete</button></td></tr>)}</tbody></table></div>}
      </section>
      </div>

      <div hidden={activeModule !== "RGB Analysis"}>
        <RgbAnalysis currentTime={currentTime} episodeId={metadata.episode_id} fps={fps} hasSource={Boolean(source)} key={source?.url ?? "no-source"} sourceKind={source?.kind ?? null} videoRef={videoRef} />
      </div>

      <AutoAnalysis activeRegion={metadata.garment_region} currentTime={currentTime} dimensions={dimensions} duration={duration} episodeId={metadata.episode_id} fps={fps} key={`analysis-${source?.url ?? "none"}`} temporal={annotations.map((annotation) => ({ label: annotation.label, start_time_sec: annotation.start_time_sec, end_time_sec: annotation.end_time_sec, source_type: annotation.annotation_source }))} videoRef={videoRef} />

      <p className={styles.thermalNote}>Thermal analysis is not available from RGB video. It requires thermal / IR sensor data.</p>
    </main>
  </>;
}
