# nAIve physics ironing v0.3

This is an additive release layer over the existing v0.2 dataset.

## Added in v0.3

- 12 human-verified temporal annotation CSVs
- 12 experimental analysis TAR packages
- 9 rendered analysis videos

## Temporal annotations

Location:

annotations/temporal/

All 12 episodes have human-verified temporal annotations.

The release CSV schema is:

episode_id
annotation_id
behavior
start_time_sec
end_time_sec
start_frame
end_frame
duration_sec
annotation_source

Accepted and adjusted machine-proposed intervals were explicitly reviewed by a human before inclusion.

Rejected and unreviewed candidates are excluded from the release temporal CSVs.

## Experimental analysis packages

Location:

analysis/packages/

Each TAR contains:

- semantics.csv
- hands.csv
- tool_track.csv
- slip.csv
- temporal_candidates.csv
- provenance.json

These are experimental analysis outputs and should not be interpreted as physical ground truth.

## Analysis videos

Location:

analysis/videos/

Rendered analysis videos are available for 9 episodes:

IRON_001
IRON_002
IRON_003
IRON_007
IRON_008
IRON_009
IRON_010
IRON_011
IRON_012

These videos are derived visual QA artifacts and do not replace the original RGB demonstrations.

## Scientific status

- RGB only
- no sensor depth
- no force or tactile sensing
- garment mask propagation and iron tracking are approximate
- optical flow represents image motion, not calibrated physical velocity
- slip candidates require explicit human review
- model-estimated and tracked outputs are not ground truth

The existing v0.2 files are preserved and are not overwritten by this release.
