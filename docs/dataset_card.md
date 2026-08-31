# GarmentDex Ironing v0.1

## Dataset Summary

GarmentDex Ironing v0.1 is a pilot real-world dataset of human garment manipulation focused on ironing and wrinkle removal for Physical AI, robotics, and textile automation research.

## Current Contents

- 3 manipulation episodes
- 1 cotton t-shirt
- Regions:
  - `front_body`
  - `both_sleeves`
  - `back_body`
- 257 seconds of manipulation video total
- Single fixed top-down RGB camera
- 24 fps
- 848 x 478 video resolution
- 10 cm spatial reference grid
- Calibration photo and calibration video

## Intended Use

The dataset is intended to support exploratory work in:

- garment manipulation research
- imitation learning research
- deformable object manipulation
- textile automation
- embodied AI / Physical AI experimentation

The current pilot is not sufficient on its own to train a production robot.

## Dataset Structure

- Raw videos live in `data/raw/`.
- Episode-level metadata lives in `data/metadata.csv`.
- Schema documentation lives in `docs/schema.md`.
- Collection methodology lives in `docs/collection_protocol.md`.

## Data Collection

The dataset was captured indoors on a fixed ironing surface with a 10 cm physical grid as a spatial reference. A single smartphone camera was positioned at an approximately 90-degree top-down view and remained fixed between episodes. The camera had a portrait physical orientation, and the operator entered from camera-left.

Each episode records one continuous ironing interaction over a target garment region. At the beginning, the garment is stationary and the hands and iron are outside the frame. The episode then includes hand entry, natural garment positioning or tensioning, iron entry, the ironing interaction, and release. It ends after the hands and iron leave the frame and the garment remains stationary briefly.

## Annotation

Current annotations consist of episode-level metadata. The dataset does not include frame-level annotations, hand-pose annotations, force measurements, depth data, or trajectory annotations.

## Calibration

The capture set includes an empty-grid calibration photo, `CAL_001_grid.jpg`, and an empty-grid calibration video, `CAL_001_grid.mp4`. The 10 cm grid provides a visual spatial reference only and does not constitute full intrinsic or extrinsic camera calibration.

## Known Limitations

- Pilot-scale dataset
- 3 episodes
- Single operator
- Single garment
- Single material
- Single environment
- RGB only
- Single camera
- No depth
- No force/tactile sensing
- No formal camera calibration
- No frame-level action segmentation
- No outcome evaluation rubric yet

## Commercial Status

This pilot is being developed as a commercially licensable dataset product. Commercial access terms are to be defined separately. This statement does not provide a legal guarantee about licensing terms.

## Version

Version: v0.1  
Status: pilot
