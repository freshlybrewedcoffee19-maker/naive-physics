"use client";

import { useState } from "react";
import { IRONING_EPISODES, readEpisodeField } from "../data/ironing-episodes";
import styles from "./dataset.module.css";

const episodes = IRONING_EPISODES;

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
  const readField = (field: string) => readEpisodeField(selected, field);
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
