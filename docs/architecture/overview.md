# ZoneGuard architecture

ZoneGuard is a two-part local application:

- `zoneguard/` contains the FastAPI API, OpenCV 5 vision engine, tracking and
  evidence-driven investigation controller, and MCP server/client helpers.
- `frontend/` contains the React/Vite investigation console and its optional
  Express proxy. The proxy forwards API calls to the FastAPI service and keeps
  the Gemini API key server-side.

The backend serves the legacy static console from `static/` and persists each
analysis under `data/results/<analysis_id>/`. Uploaded source videos are stored
under `data/uploads/`. Both directories are runtime state and must not be
committed or baked into a container image.

The detector model is the OpenCV Zoo YOLOX INT8 ONNX asset in `models/`. The
model path is resolved relative to the repository by default and can be
overridden with `ZONEGUARD_MODEL`; the SHA-256 integrity check is implemented
by the existing vision module.

The supplied `OpenCV-Computer-Vision-Projects-with-Python-master/` and
`opencv-mcp-server-main/` trees are reference/source repositories. ZoneGuard
does not import them at runtime. Keep them separately managed or remove them
from a public checkout after confirming they are no longer needed.
