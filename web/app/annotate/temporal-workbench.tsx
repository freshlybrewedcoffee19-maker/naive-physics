"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { SiteHeader } from "../site-header";
import { IRONING_EPISODES, readEpisodeField } from "../data/ironing-episodes";
import styles from "./annotate.module.css";

const sampleEpisode = IRONING_EPISODES[0];

const BEHAVIORS = [
  ["initial_state", "Garment stationary before active manipulation."],
  ["approach", "Hand or tool moves toward the target/workspace before interaction."],
  ["position", "Garment is moved or aligned into a working configuration."],
  ["tension", "Fabric is held, pulled or stabilized to create/control tension."],
  ["iron_stroke", "Iron contacts fabric while translating across it."],
  ["iron_hold", "Iron remains in contact with fabric with little or no translational movement."],
  ["reposition", "Garment or tool configuration changes between active ironing interactions."],
  ["inspect", "Operator checks the garment/result without active ironing."],
  ["release", "Active contact/manipulation ends."],
  ["terminal_state", "Garment remains stationary after manipulation is complete."],
] as const;

const MODULES = [
  ["Temporal", "Active"],
  ["RGB Analysis", "Coming next"],
  ["Depth", "Coming next"],
  ["3D", "Coming next"],
  ["Thermal", "Sensor required"],
] as const;

const EMPTY_METADATA = {
  episode_id: "",
  garment_type: "",
  garment_region: "",
  material: "",
  task: "",
  action: "",
  frame_rate_fps: "",
};

type Behavior = (typeof BEHAVIORS)[number][0];
type MetadataState = typeof EMPTY_METADATA;
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

const roundTime = (value: number) => Math.round(value * 1000) / 1000;
const frameFromTime = (time: number, fps: number | null) => fps ? Math.round(time * fps) : null;
const formatDuration = (seconds: number) => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = Math.floor(safeSeconds % 60);
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

export function TemporalWorkbench() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nextAnnotationNumber = useRef(1);
  const [source, setSource] = useState<VideoSource>(null);
  const [metadata, setMetadata] = useState<MetadataState>(EMPTY_METADATA);
  const [duration, setDuration] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [behavior, setBehavior] = useState<Behavior | "">("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validation, setValidation] = useState("");

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
    nextAnnotationNumber.current = 1;
  }, []);

  const approveSourceChange = () => annotations.length === 0 || window.confirm("Selecting another video will clear the current annotation session. Export your annotations first if you need to keep them. Continue?");

  const releaseLocalVideo = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  const activateSource = (nextSource: Exclude<VideoSource, null>, nextMetadata: MetadataState) => {
    releaseLocalVideo();
    setSource(nextSource);
    setMetadata(nextMetadata);
    setDuration(0);
    setDimensions({ width: 0, height: 0 });
    resetAnnotationState();
  };

  const loadSample = () => {
    if (!approveSourceChange()) return;
    activateSource(
      { kind: "sample", name: "IRON_001_action.mp4", url: sampleEpisode.videoPath },
      {
        episode_id: String(readEpisodeField(sampleEpisode, "episode_id") ?? ""),
        garment_type: String(readEpisodeField(sampleEpisode, "garment_type") ?? ""),
        garment_region: String(readEpisodeField(sampleEpisode, "garment_region") ?? ""),
        material: String(readEpisodeField(sampleEpisode, "material") ?? ""),
        task: String(readEpisodeField(sampleEpisode, "task") ?? ""),
        action: String(readEpisodeField(sampleEpisode, "action") ?? ""),
        frame_rate_fps: String(readEpisodeField(sampleEpisode, "frame_rate_fps") ?? ""),
      },
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
    objectUrlRef.current = url;
    setSource({ kind: "local", name: file.name, url });
    setMetadata(EMPTY_METADATA);
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
    setValidation("");
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
  };

  const exportCsv = () => {
    if (!metadata.episode_id.trim()) {
      setValidation("Episode ID is required before export.");
      return;
    }
    const columns = ["episode_id","annotation_id","label","start_time_sec","end_time_sec","start_frame","end_frame","duration_sec","annotation_source"] as const;
    const rows = annotations.map((annotation) => columns.map((column) => {
      const value = annotation[column];
      if (value === null) return "";
      return typeof value === "number" && (column.includes("time") || column === "duration_sec") ? value.toFixed(3) : String(value);
    }));
    const csv = [columns, ...rows].map((row) => row.join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${metadata.episode_id.trim()}_annotations.csv`;
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

  return <>
    <SiteHeader active="annotate" />
    <div className={styles.toolContext}>
      <div><span>nAIve physics</span><strong>Free Annotation Tool</strong></div>
      <div><span>Temporal Annotation</span><strong>v0.2</strong></div>
    </div>
    <nav className={styles.moduleNav} aria-label="Data Workbench modules">
      {MODULES.map(([module, status], index) => <button aria-current={index === 0 ? "page" : undefined} disabled={index !== 0} key={module} title={module === "Thermal" ? "Requires thermal / IR sensor data." : undefined} type="button">{module}<span>{status}</span></button>)}
    </nav>
    <main className={styles.workbench}>
      <section className={styles.episodeHead}>
        <div><p>FREE TOOL / DATA WORKBENCH</p><h1>Turn video into temporal data.</h1><span>Convert manipulation video into human-verified temporal data.</span></div>
        <div className={styles.provenance}><strong>Temporal behavior</strong><p>Source: <b>Human annotated</b></p><p>Frame index: <b>Derived from timestamp × FPS</b></p></div>
      </section>

      <section className={styles.sourceSetup} aria-labelledby="source-title">
        <div className={styles.sourceIntro}><p>01 / VIDEO INPUT</p><h2 id="source-title">Choose a manipulation video.</h2><p>The selected file stays in this browser session. It is not automatically added to the nAIve physics commercial dataset.</p></div>
        <div className={styles.sourceActions}>
          <input accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className={styles.fileInput} id="video-upload" onChange={handleVideoSelection} ref={fileInputRef} type="file" />
          <label className={styles.uploadButton} htmlFor="video-upload">Upload video <span>MP4 · MOV · WEBM</span></label>
          <button className={styles.sampleButton} onClick={loadSample} type="button">Try with sample episode <span>IRON_001</span></button>
        </div>
      </section>

      <section className={styles.metadataSection} aria-labelledby="metadata-title">
        <div className={styles.sectionHead}><div><p>02 / RECORD IDENTITY</p><h2 id="metadata-title">Episode metadata</h2></div><span>{source ? `${source.kind} / ${source.name}` : "No video selected"}</span></div>
        <div className={styles.metadataGrid}>
          {(Object.keys(EMPTY_METADATA) as Array<keyof MetadataState>).map((field) => <label key={field}>{field}{field === "episode_id" || field === "frame_rate_fps" ? <b>Required</b> : null}<input inputMode={field === "frame_rate_fps" ? "decimal" : "text"} min={field === "frame_rate_fps" ? "0.001" : undefined} onChange={(event) => updateMetadata(field, event.target.value)} placeholder={field === "frame_rate_fps" ? "Enter FPS" : "Optional"} step={field === "frame_rate_fps" ? "any" : undefined} type={field === "frame_rate_fps" ? "number" : "text"} value={metadata[field]} /></label>)}
        </div>
        {!fps ? <p className={styles.fpsNotice}>FPS REQUIRED for frame indices. Time-based annotation remains available.</p> : null}
      </section>

      <section className={styles.playerSection} aria-label="Temporal annotation player">
        {source ? <video controls key={source.url} onLoadedMetadata={(event) => { const video = event.currentTarget; setDuration(video.duration); setDimensions({ width: video.videoWidth, height: video.videoHeight }); setCurrentTime(0); }} onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} preload="metadata" ref={videoRef}><source src={source.url} />Your browser does not support HTML5 video.</video> : <div className={styles.playerEmpty}><strong>No video loaded</strong><span>Upload a local video or try the sample episode.</span></div>}
        <div className={styles.liveReadout}><div><span>Current time</span><strong>{currentTime.toFixed(2)} s</strong></div><div><span>Current frame</span><strong>{currentFrame === null ? "FPS REQUIRED" : String(currentFrame).padStart(4,"0")}</strong></div><div><span>Media</span><strong>{duration ? `${formatDuration(duration)} · ${dimensions.width} × ${dimensions.height}` : "Awaiting metadata"}</strong></div><div><span>Episode</span><strong>{metadata.episode_id || "REQUIRED"}</strong></div></div>
        <div className={styles.shortcuts}><span><kbd>Space</kbd> Play / pause</span><span><kbd>[</kbd> Mark start</span><span><kbd>]</kbd> Mark end</span></div>
      </section>

      <section className={styles.timelineSection} aria-labelledby="timeline-title"><div className={styles.sectionHead}><div><p>03 / BEHAVIOR TRACK</p><h2 id="timeline-title">Timeline</h2></div><span>00:00 — {formatDuration(duration)}</span></div><div className={styles.timeline} aria-label="Temporal annotation timeline"><div className={styles.playhead} style={{ left: `${Math.min(100, currentTime / safeDuration * 100)}%` }}/>{annotations.map((annotation) => <button aria-label={`Select ${annotation.annotation_id} ${annotation.label}`} className={`${styles.segment} ${selectedId === annotation.annotation_id ? styles.segmentSelected : ""}`} key={annotation.annotation_id} onClick={() => selectAnnotation(annotation)} style={{left:`${annotation.start_time_sec / safeDuration * 100}%`,width:`${annotation.duration_sec / safeDuration * 100}%`}} type="button"><span>{annotation.label}</span></button>)}</div><div className={styles.timelineTicks}>{ticks.map((tick, index) => <span key={index}>{tick.toFixed(tick < 10 ? 1 : 0)} s</span>)}</div></section>

      <section className={styles.annotationBuilder} aria-labelledby="controls-title"><div className={styles.controlPanel}><div className={styles.sectionHead}><div><p>04 / HUMAN VERIFICATION</p><h2 id="controls-title">Annotation controls</h2></div></div><div className={styles.markButtons}><button disabled={!source} onClick={markStart} type="button">Mark start <kbd>[</kbd></button><button disabled={!source} onClick={markEnd} type="button">Mark end <kbd>]</kbd></button></div><label>Behavior<select onChange={(event) => { setBehavior(event.target.value as Behavior | ""); setValidation(""); }} value={behavior}><option value="">Choose behavior</option>{BEHAVIORS.map(([label,definition]) => <option key={label} title={definition} value={label}>{label}</option>)}</select></label><dl className={styles.proposedSegment}><div><dt>Start</dt><dd>{formatMark(startTime)}</dd></div><div><dt>End</dt><dd>{formatMark(endTime)}</dd></div><div><dt>Duration</dt><dd>{proposedDuration === null ? "—" : `${proposedDuration.toFixed(2)} s`}</dd></div></dl>{validation ? <p className={styles.validation} role="alert">{validation}</p> : null}<button className={styles.addButton} onClick={addSegment} type="button">Add segment</button></div><aside className={styles.ontology}><p>Controlled vocabulary</p>{BEHAVIORS.map(([label,definition]) => <details key={label}><summary>{label}</summary><span>{definition}</span></details>)}</aside></section>

      <section className={styles.records} aria-labelledby="records-title"><div className={styles.recordsHeader}><div><p>05 / SESSION RECORDS</p><h2 id="records-title">Annotation records</h2></div><div><span>Annotations are not saved until exported.</span><button disabled={annotations.length === 0} onClick={exportCsv} type="button">Export CSV</button></div></div>{annotations.length === 0 ? <div className={styles.emptyState}><strong>No temporal annotations yet.</strong><p>Choose a video, mark a start and end point, then create the first human-verified behavior segment.</p></div> : <div className={styles.tableWrap}><table><thead><tr><th>ID</th><th>Label</th><th>Start</th><th>End</th><th>Duration</th><th>Start frame</th><th>End frame</th><th>Source</th><th>Actions</th></tr></thead><tbody>{annotations.map((annotation) => <tr className={selectedId === annotation.annotation_id ? styles.selectedRow : ""} key={annotation.annotation_id}><td>{annotation.annotation_id}</td><td>{annotation.label}</td><td>{annotation.start_time_sec.toFixed(3)}</td><td>{annotation.end_time_sec.toFixed(3)}</td><td>{annotation.duration_sec.toFixed(3)}</td><td>{annotation.start_frame ?? "—"}</td><td>{annotation.end_frame ?? "—"}</td><td>{annotation.annotation_source}</td><td><button onClick={() => selectAnnotation(annotation)} type="button">Select</button><button onClick={() => deleteAnnotation(annotation.annotation_id)} type="button">Delete</button></td></tr>)}</tbody></table></div>}</section>

      <p className={styles.thermalNote}>Thermal analysis is not available from RGB video. It requires thermal / IR sensor data.</p>
    </main>
  </>;
}
