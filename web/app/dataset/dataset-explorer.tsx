"use client";

import { useState } from "react";
import styles from "./dataset.module.css";

const episodes = [
  {
    experiment: "EXP 001",
    id: "IRON_001",
    videoPath: "/dataset/episodes/IRON_001_action.mp4",
    region: "front_body",
    duration: "91 s",
    metadata: [
      ["episode_id", "IRON_001"], ["video_file", "IRON_001_action.mp4"], ["garment_type", "t_shirt"],
      ["garment_region", "front_body"], ["task", "wrinkle_removal"], ["action", "ironing"],
      ["material", "cotton"], ["camera_view", "top_down"], ["camera_motion", "fixed"],
      ["operator_entry_side", "left"], ["grid_spacing_cm", "10"], ["duration_seconds", "91"],
      ["frame_width_px", "848"], ["frame_height_px", "478"], ["frame_rate_fps", "24"],
      ["total_bitrate_kbps", "1263"], ["outcome", null],
    ],
  },
  {
    experiment: "EXP 002",
    id: "IRON_002",
    videoPath: "/dataset/episodes/IRON_002_action.mp4",
    region: "both_sleeves",
    duration: "93 s",
    metadata: [
      ["episode_id", "IRON_002"], ["video_file", "IRON_002_action.mp4"], ["garment_type", "t_shirt"],
      ["garment_region", "both_sleeves"], ["task", "wrinkle_removal"], ["action", "ironing"],
      ["material", "cotton"], ["camera_view", "top_down"], ["camera_motion", "fixed"],
      ["operator_entry_side", "left"], ["grid_spacing_cm", "10"], ["duration_seconds", "93"],
      ["frame_width_px", "848"], ["frame_height_px", "478"], ["frame_rate_fps", "24"],
      ["total_bitrate_kbps", "1264"], ["outcome", null],
    ],
  },
  {
    experiment: "EXP 003",
    id: "IRON_003",
    videoPath: "/dataset/episodes/IRON_003_action.mp4",
    region: "back_body",
    duration: "73 s",
    metadata: [
      ["episode_id", "IRON_003"], ["video_file", "IRON_003_action.mp4"], ["garment_type", "t_shirt"],
      ["garment_region", "back_body"], ["task", "wrinkle_removal"], ["action", "ironing"],
      ["material", "cotton"], ["camera_view", "top_down"], ["camera_motion", "fixed"],
      ["operator_entry_side", "left"], ["grid_spacing_cm", "10"], ["duration_seconds", "73"],
      ["frame_width_px", "848"], ["frame_height_px", "478"], ["frame_rate_fps", "24"],
      ["total_bitrate_kbps", "1517"], ["outcome", null],
    ],
  },
] as const;

const metadataGroups = [
  ["Task", [["garment_type","garment"],["garment_region","region"],["material","material"],["task","task"],["action","action"]]],
  ["Capture", [["camera_view","camera view"],["camera_motion","camera motion"],["operator_entry_side","operator entry"],["grid_spacing_cm","grid spacing / cm"]]],
  ["Media", [["duration_seconds","duration / sec"],["frame_width_px","frame width / px"],["frame_height_px","frame height / px"],["frame_rate_fps","fps"],["total_bitrate_kbps","bitrate / kbps"]]],
  ["Evaluation", [["outcome","outcome"]]],
] as const;

export function DatasetExplorer() {
  const [selectedId, setSelectedId] = useState<(typeof episodes)[number]["id"]>("IRON_001");
  const [currentTime, setCurrentTime] = useState(0);
  const selected = episodes.find((episode) => episode.id === selectedId) ?? episodes[0];
  const readField = (field: string) => selected.metadata.find(([key]) => key === field)?.[1] ?? null;
  const frameRate = Number(readField("frame_rate_fps"));
  const currentFrame = Math.round(currentTime * frameRate);
  const updateCurrentTime = (video: HTMLVideoElement) => setCurrentTime(video.currentTime);

  return (
    <div className={styles.explorerShell}>
      <div className={styles.connectedVideo}>
        <video controls key={selected.id} onLoadedMetadata={() => setCurrentTime(0)} onSeeked={(event) => updateCurrentTime(event.currentTarget)} onTimeUpdate={(event) => updateCurrentTime(event.currentTarget)} preload="metadata">
          <source src={selected.videoPath} type="video/mp4" />
          Your browser does not support HTML5 video.
        </video>
        <div className={styles.videoInspection} aria-label="Live video inspection data">
          <div><span>Current time</span><strong>{currentTime.toFixed(1)} s</strong></div>
          <div className={styles.timeReadout}><span>Current frame</span><strong>{String(currentFrame).padStart(4, "0")}</strong></div>
          <div><span>FPS</span><strong>{readField("frame_rate_fps")}</strong></div>
          <div><span>Episode</span><strong>{selected.id}</strong></div>
          <div><span>Region</span><strong>{readField("garment_region")}</strong></div>
        </div>
      </div>
      <div className={styles.episodeSelector} role="group" aria-label="Select an episode">
        {episodes.map((episode) => {
          const isSelected = episode.id === selectedId;
          return (
            <button
              aria-controls="episode-detail"
              aria-pressed={isSelected}
              className={`${styles.episodeButton} ${isSelected ? styles.episodeButtonActive : ""}`}
              key={episode.id}
              onClick={() => { setSelectedId(episode.id); setCurrentTime(0); }}
              type="button"
            >
              <span className={styles.expName}>{episode.experiment}</span>
              <strong>{episode.region.replace("_", " ")}</strong>
              <span>{episode.duration}</span>
              <small>{episode.id}</small>
            </button>
          );
        })}
      </div>

      <div className={styles.episodeDetail} id="episode-detail">
        <div className={styles.metadataPanel}>
          <div className={styles.metadataHead}>
            <div><span>Selected record</span><strong>{selected.id}</strong></div>
            <span>17 fields</span>
          </div>
          <div className={styles.metadataGroups}>{metadataGroups.map(([group,fields])=><section key={group}><h3>{group}</h3><dl>{fields.map(([field,label])=>{const value=readField(field);return <div key={field}><dt>{label}</dt><dd className={value===null?styles.nullValue:""}>{value??"undefined / no rubric"}</dd></div>})}</dl></section>)}</div>
        </div>
      </div>
    </div>
  );
}
