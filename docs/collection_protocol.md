# GarmentDex v0.1 Collection Protocol

## Environment

- Indoor capture
- Fixed ironing surface
- 10 cm physical grid used as a spatial reference

## Camera Setup

- Single smartphone camera
- Approximately 90-degree top-down view
- Fixed camera position
- Portrait physical orientation
- Operator enters from camera-left
- Camera is not moved between episodes

## Calibration Reference

- Empty grid photo: `CAL_001_grid.jpg`
- Empty grid video: `CAL_001_grid.mp4`
- Grid spacing: 10 cm
- Grid provides a visual spatial reference only
- It is not equivalent to full intrinsic/extrinsic camera calibration

## Episode Definition

One episode is one continuous ironing interaction over a target garment region.

Episode begins:

- garment stationary
- hands and iron outside frame

Episode contains:

- hand entry
- natural garment positioning/tensioning
- iron entry
- ironing interaction
- release

Episode ends:

- hands and iron leave frame
- garment remains stationary briefly

## Current Capture Set

- `IRON_001`: cotton t-shirt, front body
- `IRON_002`: cotton t-shirt, both sleeves
- `IRON_003`: cotton t-shirt, back body

## Data Quality Rules

- Keep original files unchanged in `data/raw/`
- Do not infer unknown metadata
- Use controlled vocabulary where defined
- Preserve consistent camera geometry across episodes

## Known Limitations

- Single operator
- Single garment
- Single material
- Single environment
- Single camera
- RGB only
- No depth
- No force/tactile sensing
- No formal camera calibration
- No outcome rubric yet
- Very small pilot sample
