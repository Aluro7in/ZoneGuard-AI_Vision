# Docker deployment notes

The root `Dockerfile` builds the FastAPI backend only. It installs the pinned
Python dependencies, copies `zoneguard/`, `static/`, and `models/`, and creates
the upload directory at image build time. The application creates both runtime
directories on import as an additional startup safeguard.

`PORT` is configurable and defaults to `8080`. Uvicorn binds to
`0.0.0.0`, and the image health check requests `/api/health` on the same port.

```powershell
docker build -t zoneguard:local .
docker run --rm -p 8080:8080 -e PORT=8080 zoneguard:local
Invoke-WebRequest http://127.0.0.1:8080/api/health
```

For persistent local artifacts, mount a host directory at `/app/data`. For
AWS, use an external artifact store and replace local filesystem persistence
before running multiple replicas. No AWS deployment is implied by this
document.
