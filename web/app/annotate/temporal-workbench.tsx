"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IRONING_EPISODES, readEpisodeField } from "../data/ironing-episodes";
import styles from "./annotate.module.css";

const episode = IRONING_EPISODES[0];
const frameRate = Number(readEpisodeField(episode, "frame_rate_fps"));
const episodeDuration = Number(readEpisodeField(episode, "duration_seconds"));

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

type Behavior = (typeof BEHAVIORS)[number][0];
type Annotation = {
  episode_id: "IRON_001";
  annotation_id: string;
  label: Behavior;
  start_time_sec: number;
  end_time_sec: number;
  start_frame: number;
  end_frame: number;
  duration_sec: number;
  annotation_source: "human_annotated";
};

const roundTime = (value: number) => Math.round(value * 1000) / 1000;
const toFrame = (time: number) => Math.round(time * frameRate);
const formatMark = (time: number | null) => time === null ? "Not marked" : `${time.toFixed(2)} s / frame ${toFrame(time)}`;

export function TemporalWorkbench() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const nextAnnotationNumber = useRef(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [endTime, setEndTime] = useState<number | null>(null);
  const [behavior, setBehavior] = useState<Behavior | "">("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [validation, setValidation] = useState("");

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

  const addSegment = () => {
    if (startTime === null) { setValidation("Mark a segment start before adding it."); return; }
    if (endTime === null) { setValidation("Mark a segment end before adding it."); return; }
    if (!behavior) { setValidation("Choose a behavior before adding the segment."); return; }
    if (endTime <= startTime) { setValidation("End time must be later than start time."); return; }
    const annotation: Annotation = {
      episode_id: "IRON_001",
      annotation_id: `ANN_${String(nextAnnotationNumber.current).padStart(3, "0")}`,
      label: behavior,
      start_time_sec: startTime,
      end_time_sec: endTime,
      start_frame: toFrame(startTime),
      end_frame: toFrame(endTime),
      duration_sec: roundTime(endTime - startTime),
      annotation_source: "human_annotated",
    };
    nextAnnotationNumber.current += 1;
    setAnnotations((current) => [...current, annotation]);
    setSelectedId(annotation.annotation_id);
    setStartTime(null); setEndTime(null); setBehavior(""); setValidation("");
  };

  const selectAnnotation = (annotation: Annotation) => {
    setSelectedId(annotation.annotation_id);
    const video = videoRef.current;
    if (video) { video.currentTime = annotation.start_time_sec; setCurrentTime(annotation.start_time_sec); }
  };

  const deleteAnnotation = (annotationId: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.annotation_id !== annotationId));
    setSelectedId((current) => current === annotationId ? null : current);
  };

  const exportCsv = () => {
    const columns = ["episode_id","annotation_id","label","start_time_sec","end_time_sec","start_frame","end_frame","duration_sec","annotation_source"] as const;
    const rows = annotations.map((annotation) => columns.map((column) => {
      const value = annotation[column];
          return typeof value === "number" &&
            (column.includes("time") || column === "duration_sec")
            ? value.toFixed(3)
            : String(value);
    }));
    const csv = [columns, ...rows].map((row) => row.join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "IRON_001_annotations.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  };

  const currentFrame = toFrame(currentTime);
  const proposedDuration = startTime !== null && endTime !== null ? roundTime(endTime - startTime) : null;

  return <>
    <header className={styles.workbenchHeader}><div><strong>nAIve physics</strong><span>/ Data Workbench</span></div><div><span>Temporal Annotation</span><strong>v0.2</strong></div></header>
    <nav className={styles.moduleNav} aria-label="Workbench modules"><button aria-current="page" type="button">Temporal <span>Active</span></button>{["Wrinkles","Depth","3D","Thermal","Interaction","QA"].map((module) => <button disabled key={module} type="button">{module}<span>Future</span></button>)}</nav>
    <div className={styles.workbench}>
      <section className={styles.episodeHead}><div><p>DATA PRODUCTION / HUMAN ANNOTATION</p><h1>IRON_001</h1><span>Temporal Annotation</span></div><div className={styles.provenance}><strong>Temporal behavior</strong><p>Source: <b>Human annotated</b></p><p>Frame index: <b>Derived from timestamp × FPS</b></p></div></section>

      <section className={styles.playerSection} aria-label="IRON_001 annotation player">
        <video controls onSeeked={(event) => setCurrentTime(event.currentTarget.currentTime)} onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)} preload="metadata" ref={videoRef}><source src={episode.videoPath} type="video/mp4"/>Your browser does not support HTML5 video.</video>
        <div className={styles.liveReadout}><div><span>Current time</span><strong>{currentTime.toFixed(2)} s</strong></div><div><span>Current frame</span><strong>{String(currentFrame).padStart(4,"0")}</strong></div><div><span>FPS</span><strong>{frameRate}</strong></div><div><span>Episode</span><strong>IRON_001</strong></div></div>
        <div className={styles.shortcuts}><span><kbd>Space</kbd> Play / pause</span><span><kbd>[</kbd> Mark start</span><span><kbd>]</kbd> Mark end</span></div>
      </section>

      <section className={styles.timelineSection} aria-labelledby="timeline-title"><div className={styles.sectionHead}><div><p>Behavior track</p><h2 id="timeline-title">Timeline</h2></div><span>00:00 — 01:31</span></div><div className={styles.timeline} aria-label="91 second temporal annotation timeline"><div className={styles.playhead} style={{ left: `${Math.min(100, currentTime / episodeDuration * 100)}%` }}/>{annotations.map((annotation) => <button aria-label={`Select ${annotation.annotation_id} ${annotation.label}`} className={`${styles.segment} ${selectedId === annotation.annotation_id ? styles.segmentSelected : ""}`} key={annotation.annotation_id} onClick={() => selectAnnotation(annotation)} style={{left:`${annotation.start_time_sec / episodeDuration * 100}%`,width:`${annotation.duration_sec / episodeDuration * 100}%`}} type="button"><span>{annotation.label}</span></button>)}</div><div className={styles.timelineTicks}><span>0 s</span><span>22.75 s</span><span>45.5 s</span><span>68.25 s</span><span>91 s</span></div></section>

      <section className={styles.annotationBuilder} aria-labelledby="controls-title"><div className={styles.controlPanel}><div className={styles.sectionHead}><div><p>Human verification</p><h2 id="controls-title">Annotation controls</h2></div></div><div className={styles.markButtons}><button onClick={markStart} type="button">Mark start <kbd>[</kbd></button><button onClick={markEnd} type="button">Mark end <kbd>]</kbd></button></div><label>Behavior<select onChange={(event) => { setBehavior(event.target.value as Behavior | ""); setValidation(""); }} value={behavior}><option value="">Choose behavior</option>{BEHAVIORS.map(([label,definition]) => <option key={label} title={definition} value={label}>{label}</option>)}</select></label><dl className={styles.proposedSegment}><div><dt>Start</dt><dd>{formatMark(startTime)}</dd></div><div><dt>End</dt><dd>{formatMark(endTime)}</dd></div><div><dt>Duration</dt><dd>{proposedDuration === null ? "—" : `${proposedDuration.toFixed(2)} s`}</dd></div></dl>{validation ? <p className={styles.validation} role="alert">{validation}</p> : null}<button className={styles.addButton} onClick={addSegment} type="button">Add segment</button></div><aside className={styles.ontology}><p>Controlled vocabulary</p>{BEHAVIORS.map(([label,definition]) => <details key={label}><summary>{label}</summary><span>{definition}</span></details>)}</aside></section>

      <section className={styles.records} aria-labelledby="records-title"><div className={styles.recordsHeader}><div><p>Session records</p><h2 id="records-title">Annotation records</h2></div><div><span>Annotations are not saved until exported.</span><button disabled={annotations.length === 0} onClick={exportCsv} type="button">Export CSV</button></div></div>{annotations.length === 0 ? <div className={styles.emptyState}><strong>No temporal annotations yet.</strong><p>Mark a start and end point to create the first human-verified behavior segment.</p></div> : <div className={styles.tableWrap}><table><thead><tr><th>ID</th><th>Label</th><th>Start</th><th>End</th><th>Duration</th><th>Start frame</th><th>End frame</th><th>Source</th><th>Actions</th></tr></thead><tbody>{annotations.map((annotation) => <tr className={selectedId === annotation.annotation_id ? styles.selectedRow : ""} key={annotation.annotation_id}><td>{annotation.annotation_id}</td><td>{annotation.label}</td><td>{annotation.start_time_sec.toFixed(3)}</td><td>{annotation.end_time_sec.toFixed(3)}</td><td>{annotation.duration_sec.toFixed(3)}</td><td>{annotation.start_frame}</td><td>{annotation.end_frame}</td><td>{annotation.annotation_source}</td><td><button onClick={() => selectAnnotation(annotation)} type="button">Select</button><button onClick={() => deleteAnnotation(annotation.annotation_id)} type="button">Delete</button></td></tr>)}</tbody></table></div>}</section>
    </div>
  </>;
}
