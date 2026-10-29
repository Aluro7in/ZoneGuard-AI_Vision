# ZoneGuard — Agentic Visual Safety Inspector

ZoneGuard uses OpenCV 5 for video metadata, frame sampling, motion analysis, detection, tracking and zone geometry. Its bounded controller executes registered tools and records the actual call ID, arguments, result summary, duration, status and next action.

## Run

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$port = if ($env:PORT) { $env:PORT } else { 8080 }
uvicorn zoneguard.main:app --reload --host 0.0.0.0 --port $port
pytest
```

Open `http://localhost:8080`, upload a video, click at least three zone points, then run the inspection. The initial scan branches: observed in-zone detections invoke evidence extraction and crossing verification; otherwise region motion analysis runs. A verified outside-to-inside transition needs persistent observations; motion without reliable detection returns `REVIEW`.

API contract: `POST /api/videos` returns `video_id` and metadata; `POST /api/analyze` accepts `{video_id, polygon, zones?, max_frames?}` and returns `analysis_id`, `report`, `scan`, `evidence`, and `trace`; `GET /api/analyses/{analysis_id}` returns status; `/report` and `/annotated` return the exact run artifacts. `/api/health` reports the OpenCV runtime. Uploads are capped by `ZONEGUARD_MAX_UPLOAD_BYTES` and CORS origins are configured with `ZONEGUARD_CORS_ORIGINS`.

For containers, `PORT` defaults to `8080`; the image binds Uvicorn to `0.0.0.0`, includes the verified model under `/app/models`, creates `/app/data/uploads` and `/app/data/results` at startup, and runs a health check against the configured port.

## Repository layout

`zoneguard/` is the FastAPI/OpenCV backend, `frontend/` is the React/Vite
console and Express proxy, `static/` contains the backend-served legacy
console, `models/` contains the verified detector asset, `tests/` contains
backend tests, `scripts/` contains utilities, and `docs/` contains architecture
and deployment notes. `data/` is runtime-only local state. The two bundled
OpenCV directories are independent reference repositories and are not runtime
dependencies.

The frontend can be run separately with `npm install`, `npm run lint`,
`npm run build`, and `npm run dev` from `frontend/`. Configure its backend
target through `frontend/.env` using the safe placeholders in
`frontend/.env.example`.

## Tools and safeguards

`analyze_video`, `extract_relevant_frames`, `detect_motion`, `track_target`, `analyze_region`, `verify_zone_crossing`, and `generate_incident_report` are real registered callables. The controller invokes them through `ToolRegistry.execute_tool`; the same implementations are exposed through the official MCP Python SDK in `zoneguard/mcp_server.py`, with discovery and invocation helpers in `zoneguard/mcp_client.py`. Tracks use one-to-one association and expire after three missed sampled frames. Detections are not bridged across gaps over one second. Manual target tracking uses OpenCV CSRT when available and otherwise returns an explicit tracking-unavailable result—no repeated synthetic bounding boxes.

The primary detector is the OpenCV Zoo YOLOX INT8 ONNX asset under `models/`, with provenance and SHA-256 recorded in `models/README.md`. It runs through OpenCV DNN using documented 640×640 preprocessing, YOLOX grid decoding, COCO `person` filtering, clipping and NMS. Scores are detector confidence, not calibrated incident probabilities. HOG is retained only as an explicitly labelled low-confidence fallback. The `/api/health` endpoint reports whether the installed runtime is OpenCV 5.x.

Evaluation annotations use `evaluation/README.md` and are scored by `scripts/evaluate.py` with explicit event matching tolerance. An empty or unlabeled dataset returns `insufficient_data`; no metrics are invented. Use `python scripts/mcp_smoke.py` to test the MCP subprocess protocol.

## Deployment

The supplied `DemoVideo.gif` was processed end to end with OpenCV 5.0.0 and YOLOX. It produced a real evidence branch and a `REVIEW` result because the clip did not establish an outside-to-inside transition. The current backend suite has 11 passing tests. No precision/recall metrics are claimed because the supplied workspace contains no manually labelled evaluation set. The API is container-ready for EC2 or ECS/Fargate; no AWS credentials or verified deployment are available.
