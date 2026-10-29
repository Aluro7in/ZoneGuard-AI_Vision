# ZoneGuard evaluation dataset

Annotations are intentionally not bundled: the supplied GIF is a demonstration clip, not ground truth. Create one JSON file per video using the schema below, then run `python scripts/evaluate.py --annotations evaluation/annotations --predictions path/to/reports --output evaluation/results.json`.

Required fields:

```json
{
  "video_id": "clip-001",
  "fps": 25.0,
  "duration": 12.4,
  "events": [{"zone_id":"zone-1","event_type":"entry","start":3.2,"end":4.0,"track_id":"person-a","uncertain":false}],
  "ignore_intervals": [{"start":7.0,"end":8.0,"reason":"occlusion"}]
}
```

Event matching is one-to-one by `zone_id` and `event_type`, with absolute start-time tolerance configured by `--tolerance` (default 0.75s). Predictions overlapping an ignore interval are excluded from FP/FN scoring. Empty valid datasets return `insufficient_data` instead of fabricated zero-quality claims.
