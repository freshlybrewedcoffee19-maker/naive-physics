# GarmentDex Metadata Schema

A schema defines the structure and semantics of each metadata record so that researchers and software can interpret the dataset consistently.

This document describes the fields in `data/metadata.csv`. Each row represents one garment-manipulation episode.

## Fields

| Field name | Data type | Description | Allowed values | Required or nullable |
| --- | --- | --- | --- | --- |
| `episode_id` | string | Unique identifier for the manipulation episode. | — | Required |
| `video_file` | string | Filename of the video associated with the episode. | — | Required |
| `garment_type` | string | Type of garment manipulated in the episode. | `t_shirt` | Required |
| `garment_region` | string | Region of the garment manipulated in the episode. | `front_body`, `both_sleeves`, `back_body` | Required |
| `task` | string | Goal of the manipulation episode. | `wrinkle_removal` | Required |
| `action` | string | Physical action performed during the episode. | `ironing` | Required |
| `material` | string | Material of the garment. | `cotton` | Required |
| `camera_view` | string | Camera viewpoint used to record the episode. | `top_down` | Required |
| `camera_motion` | string | Whether the camera moves during the episode. | `fixed` | Required |
| `operator_entry_side` | string | Side of the frame from which the operator enters. | `left` | Required |
| `grid_spacing_cm` | integer | Spacing between grid lines in centimeters. | — | Required |
| `duration_seconds` | integer | Duration of the video in seconds. | — | Required |
| `frame_width_px` | integer | Width of each video frame in pixels. | — | Required |
| `frame_height_px` | integer | Height of each video frame in pixels. | — | Required |
| `frame_rate_fps` | integer | Video frame rate in frames per second. | — | Required |
| `total_bitrate_kbps` | integer | Total video bitrate in kilobits per second. | — | Required |
| `outcome` | string | Evaluation outcome for the episode. An evaluation rubric has not yet been defined. | — | Nullable |

## Units

| Field name | Unit |
| --- | --- |
| `grid_spacing_cm` | centimeters |
| `duration_seconds` | seconds |
| `frame_width_px` | pixels |
| `frame_height_px` | pixels |
| `frame_rate_fps` | frames per second |
| `total_bitrate_kbps` | kilobits per second |
