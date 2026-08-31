export const IRONING_EPISODES = [
  {
    experiment: "EXP 001", id: "IRON_001", videoPath: "/dataset/episodes/IRON_001_action.mp4", region: "front_body", duration: "91 s",
    metadata: [
      ["episode_id", "IRON_001"], ["video_file", "IRON_001_action.mp4"], ["garment_type", "t_shirt"], ["garment_region", "front_body"],
      ["task", "wrinkle_removal"], ["action", "ironing"], ["material", "cotton"], ["camera_view", "top_down"], ["camera_motion", "fixed"],
      ["operator_entry_side", "left"], ["grid_spacing_cm", "10"], ["duration_seconds", "91"], ["frame_width_px", "848"], ["frame_height_px", "478"],
      ["frame_rate_fps", "24"], ["total_bitrate_kbps", "1263"], ["outcome", null],
    ],
  },
  {
    experiment: "EXP 002", id: "IRON_002", videoPath: "/dataset/episodes/IRON_002_action.mp4", region: "both_sleeves", duration: "93 s",
    metadata: [
      ["episode_id", "IRON_002"], ["video_file", "IRON_002_action.mp4"], ["garment_type", "t_shirt"], ["garment_region", "both_sleeves"],
      ["task", "wrinkle_removal"], ["action", "ironing"], ["material", "cotton"], ["camera_view", "top_down"], ["camera_motion", "fixed"],
      ["operator_entry_side", "left"], ["grid_spacing_cm", "10"], ["duration_seconds", "93"], ["frame_width_px", "848"], ["frame_height_px", "478"],
      ["frame_rate_fps", "24"], ["total_bitrate_kbps", "1264"], ["outcome", null],
    ],
  },
  {
    experiment: "EXP 003", id: "IRON_003", videoPath: "/dataset/episodes/IRON_003_action.mp4", region: "back_body", duration: "73 s",
    metadata: [
      ["episode_id", "IRON_003"], ["video_file", "IRON_003_action.mp4"], ["garment_type", "t_shirt"], ["garment_region", "back_body"],
      ["task", "wrinkle_removal"], ["action", "ironing"], ["material", "cotton"], ["camera_view", "top_down"], ["camera_motion", "fixed"],
      ["operator_entry_side", "left"], ["grid_spacing_cm", "10"], ["duration_seconds", "73"], ["frame_width_px", "848"], ["frame_height_px", "478"],
      ["frame_rate_fps", "24"], ["total_bitrate_kbps", "1517"], ["outcome", null],
    ],
  },
] as const;

export type IroningEpisode = (typeof IRONING_EPISODES)[number];

export function readEpisodeField(episode: IroningEpisode, field: string) {
  return episode.metadata.find(([key]) => key === field)?.[1] ?? null;
}
