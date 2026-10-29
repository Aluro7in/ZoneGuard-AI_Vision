/**
 * ZoneGuard API Client
 * Connects the React frontend to the deployed FastAPI backend endpoints:
 * - GET  /api/health
 * - POST /api/videos
 * - POST /api/analyze
 * - GET  /api/analyses/{analysis_id}
 * - GET  /api/analyses/{analysis_id}/report
 * - GET  /api/analyses/{analysis_id}/annotated
 */

import {
  AgentTraceStep,
  BackendAnalysisStatusResponse,
  BackendAnalyzeRequest,
  BackendAnalyzeResponse,
  BackendCrossing,
  BackendHealthResponse,
  BackendHealthState,
  BackendVideoUploadResponse,
  BackendZonePayload,
  EventType,
  InvestigationDecision,
  InvestigationRecord,
  SafetyZone,
  TrackSummary,
  VerificationStatus,
  ZoneEvent,
} from '../types/zoneguard';
import {
  formatBackendEndpointForDisplay,
  getConfiguredBackendBaseUrl,
} from '../config/backend';

export class ZoneGuardApiError extends Error {
  public isCorsError: boolean;

  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown,
    isCorsError = false
  ) {
    super(message);
    this.name = 'ZoneGuardApiError';
    this.isCorsError = isCorsError;
  }
}

/**
 * Determine whether to use same-origin server proxy (/api/...) or direct backend URL.
 * By default, requests go through the same-origin Express proxy in server.ts and pass
 * the configured backend base URL in X-ZoneGuard-Backend-Url so browser CORS preflight
 * restrictions on the FastAPI server do not block requests.
 * If VITE_DIRECT_BACKEND="true" is set, requests go directly from browser to BACKEND_BASE_URL.
 */
function buildEndpointUrl(path: string): string {
  const metaEnv =
    typeof import.meta !== 'undefined' &&
    (import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ? (import.meta as unknown as { env: Record<string, string | undefined> }).env
      : undefined;

  if (metaEnv?.VITE_DIRECT_BACKEND === 'true') {
    return `${getConfiguredBackendBaseUrl()}${path}`;
  }
  return path;
}

function getProxyHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'X-ZoneGuard-Backend-Url': getConfiguredBackendBaseUrl(),
    ...extra,
  };
}

function detectCorsOrNetworkError(err: unknown, targetEndpoint: string): ZoneGuardApiError {
  if (err instanceof ZoneGuardApiError) {
    return err;
  }
  const rawMessage = err instanceof Error ? err.message : String(err);
  const isFetchTypeError =
    err instanceof TypeError ||
    rawMessage.toLowerCase().includes('failed to fetch') ||
    rawMessage.toLowerCase().includes('networkerror') ||
    rawMessage.toLowerCase().includes('cors');

  if (isFetchTypeError) {
    return new ZoneGuardApiError(
      `CORS or network error while contacting FastAPI backend (${formatBackendEndpointForDisplay()} → ${targetEndpoint}). Verify the backend is reachable and allows requests from this origin.`,
      0,
      err,
      true
    );
  }

  return new ZoneGuardApiError(rawMessage || `Request to ${targetEndpoint} failed`, undefined, err, false);
}

async function parseErrorResponse(res: Response, endpoint: string): Promise<ZoneGuardApiError> {
  const text = await res.text().catch(() => '');
  if (res.status === 400 && text.toLowerCase().includes('disallowed cors origin')) {
    return new ZoneGuardApiError(
      `CORS rejected by FastAPI backend (${res.status} Disallowed CORS origin on ${endpoint}).`,
      res.status,
      text,
      true
    );
  }

  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const detail = json.detail || json.message || json.error;
    if (typeof detail === 'string') {
      return new ZoneGuardApiError(detail, res.status, json, false);
    }
    if (Array.isArray(detail)) {
      const msg = detail
        .map((d: Record<string, unknown>) => `${Array.isArray(d.loc) ? d.loc.join('.') : 'field'}: ${d.msg}`)
        .join('; ');
      return new ZoneGuardApiError(msg || `Validation error (${res.status})`, res.status, json, false);
    }
  } catch {
    // Non-JSON error body
  }

  return new ZoneGuardApiError(
    text.trim() || `Backend returned HTTP ${res.status} for ${endpoint}`,
    res.status,
    text,
    false
  );
}

/**
 * Convert normalized [0..1] frontend SafetyZones into integer pixel polygons
 * bounded strictly within [0, width - 1] and [0, height - 1].
 */
export function convertZonesToPixelPayloads(
  zones: SafetyZone[],
  width: number,
  height: number
): BackendZonePayload[] {
  const safeW = Math.max(2, Math.floor(width));
  const safeH = Math.max(2, Math.floor(height));

  return zones.map((zone) => {
    const polygon: Array<[number, number]> = zone.points.map((pt) => {
      const x = Math.max(0, Math.min(safeW - 1, Math.round(pt.x * (safeW - 1))));
      const y = Math.max(0, Math.min(safeH - 1, Math.round(pt.y * (safeH - 1))));
      return [x, y];
    });
    return {
      id: zone.id,
      name: zone.name,
      severity: zone.severity,
      polygon,
    };
  });
}

/**
 * Map the real FastAPI BackendAnalyzeResponse into the frontend's InvestigationRecord
 * without fabricating any detections, events, frames, or trace entries.
 */
export function mapBackendAnalysisToRecord(
  raw: BackendAnalyzeResponse,
  options: {
    filename: string;
    filesizeBytes?: number;
    zones: SafetyZone[];
    localVideoUrl?: string;
    uploadInfo?: BackendVideoUploadResponse['info'];
  }
): InvestigationRecord {
  const videoInfo = raw.scan?.video || options.uploadInfo || {
    width: 1920,
    height: 1080,
    fps: 30,
    frame_count: 0,
    duration: 0,
    opencv_version: '5.0.0',
  };

  // Derive creation timestamp from the first trace step if available
  const firstStartedAt = raw.trace?.[0]?.started_at;
  const createdAt =
    typeof firstStartedAt === 'number' && firstStartedAt > 1000000000 && firstStartedAt < 2000000000
      ? new Date(firstStartedAt * 1000).toISOString()
      : new Date().toISOString();

  // Map zone lookup table
  const zoneNameById: Record<string, string> = {};
  options.zones.forEach((z) => {
    zoneNameById[z.id] = z.name;
  });
  raw.scan?.zones?.forEach((z) => {
    if (z.id && z.name) {
      zoneNameById[z.id] = z.name;
    }
  });

  // Extract evidence frames (base64 data URIs or URLs from backend)
  const rawFrames = raw.evidence?.frames || [];

  // Build real events from report.incidents and verification.crossings / exits
  const sourceCrossings: BackendCrossing[] = [];
  const seenKeys = new Set<string>();

  const addCrossing = (c: BackendCrossing, fallbackZoneId?: string) => {
    const zId = c.zone_id || fallbackZoneId || options.zones[0]?.id || 'zone-1';
    const key = `${c.event_type || 'event'}-${c.track_id}-${c.start}-${zId}`;
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      sourceCrossings.push({ ...c, zone_id: zId });
    }
  };

  (raw.report?.incidents || []).forEach((inc) => addCrossing(inc));
  (raw.verification?.crossings || []).forEach((c) => addCrossing(c));
  (raw.verification?.exits || []).forEach((c) => addCrossing({ ...c, event_type: c.event_type || 'exit' }));

  if (raw.verification?.by_zone) {
    Object.entries(raw.verification.by_zone).forEach(([zId, zVer]) => {
      (zVer.crossings || []).forEach((c) => addCrossing(c, zId));
      (zVer.exits || []).forEach((c) => addCrossing({ ...c, event_type: c.event_type || 'exit' }, zId));
    });
  }

  const credibleKeys = new Set<string>();
  (raw.verification?.credible_crossings || []).forEach((c) => {
    const zId = c.zone_id || options.zones[0]?.id || 'zone-1';
    credibleKeys.add(`${c.event_type || 'entry'}-${c.track_id}-${c.start}-${zId}`);
  });
  if (raw.verification?.by_zone) {
    Object.entries(raw.verification.by_zone).forEach(([zId, zVer]) => {
      (zVer.credible_crossings || []).forEach((c) => {
        credibleKeys.add(`${c.event_type || 'entry'}-${c.track_id}-${c.start}-${zId}`);
      });
    });
  }

  const events: ZoneEvent[] = sourceCrossings.map((c, index) => {
    const zId = c.zone_id || options.zones[0]?.id || 'zone-1';
    const zName = zoneNameById[zId] || zId;
    const rawType = (c.event_type || 'entry').toLowerCase();
    const eventType: EventType =
      rawType === 'entry' || rawType === 'zone_entry'
        ? 'ZONE_ENTRY'
        : rawType === 'exit' || rawType === 'zone_exit'
        ? 'ZONE_EXIT'
        : rawType.includes('dwell')
        ? 'DWELL_EXCEEDED'
        : 'UNCERTAIN_CROSSING';

    const key = `${c.event_type || 'entry'}-${c.track_id}-${c.start}-${zId}`;
    const isCredible =
      credibleKeys.has(key) ||
      (Boolean(raw.verification?.has_credible_crossing) && raw.report?.status === 'ALERT');

    const verificationStatus: VerificationStatus = isCredible
      ? 'VERIFIED'
      : raw.report?.status === 'REVIEW'
      ? 'AMBIGUOUS'
      : 'UNCONFIRMED';

    // Match evidence frames close to the event window
    const startSec = typeof c.start === 'number' ? c.start : 0;
    const endSec = typeof c.end === 'number' ? c.end : startSec;
    const matchingFrames = rawFrames
      .filter((f) => f.timestamp >= startSec - 0.6 && f.timestamp <= endSec + 0.6)
      .map((f) => `frame_${f.frame} (${f.timestamp.toFixed(2)}s)`);

    const frameLabels =
      matchingFrames.length > 0
        ? matchingFrames
        : rawFrames.slice(0, 3).map((f) => `frame_${f.frame} (${f.timestamp.toFixed(2)}s)`);

    const durationStr =
      typeof c.duration === 'number'
        ? `${c.duration.toFixed(2)}s`
        : typeof c.end === 'number'
        ? `${Math.max(0, c.end - startSec).toFixed(2)}s`
        : null;

    const reasonParts = [
      `Track #${c.track_id} ${rawType} detected at t=${startSec.toFixed(2)}s`,
      typeof c.end === 'number' ? `to t=${c.end.toFixed(2)}s` : null,
      durationStr ? `(duration ${durationStr})` : null,
      typeof c.evidence_count === 'number' ? `with ${c.evidence_count} frame observations` : null,
      `— ${raw.report?.reason || raw.report?.status}`,
    ].filter(Boolean);

    return {
      id: `evt-${index + 1}-trk-${c.track_id}`,
      timestamp_seconds: startSec,
      end_timestamp_seconds: c.end,
      duration_seconds: c.duration,
      zone_id: zId,
      zone_name: zName,
      event_type: eventType,
      track_id: c.track_id,
      confidence: typeof c.confidence === 'number' ? c.confidence : 0,
      evidence_count: c.evidence_count,
      verification_status: verificationStatus,
      evidence_frames: frameLabels,
      reason_explanation: reasonParts.join(' '),
      review_state: 'PENDING_OPERATOR_SIGN_OFF',
    };
  });

  // Aggregate real observations into TrackSummary rows
  const observations = raw.scan?.observations || [];
  const trackMap = new Map<
    number,
    {
      label: string;
      firstSeen: number;
      lastSeen: number;
      insideAnyZone: boolean;
      zonesInside: Set<string>;
      count: number;
      maxConf: number;
    }
  >();

  observations.forEach((obs) => {
    const existing = trackMap.get(obs.track_id);
    const insideZones = (obs.zones || [])
      .filter((z) => z.inside)
      .map((z) => z.zone_name || z.zone_id);

    if (!existing) {
      const set = new Set<string>(insideZones);
      if (obs.inside_zone && set.size === 0 && options.zones[0]) {
        set.add(options.zones[0].name);
      }
      trackMap.set(obs.track_id, {
        label: obs.label || 'person',
        firstSeen: obs.timestamp,
        lastSeen: obs.timestamp,
        insideAnyZone: Boolean(obs.inside_zone) || insideZones.length > 0,
        zonesInside: set,
        count: 1,
        maxConf: obs.confidence || 0,
      });
    } else {
      existing.firstSeen = Math.min(existing.firstSeen, obs.timestamp);
      existing.lastSeen = Math.max(existing.lastSeen, obs.timestamp);
      if (obs.inside_zone || insideZones.length > 0) {
        existing.insideAnyZone = true;
      }
      insideZones.forEach((z) => existing.zonesInside.add(z));
      existing.count += 1;
      existing.maxConf = Math.max(existing.maxConf, obs.confidence || 0);
    }
  });

  const tracks: TrackSummary[] = Array.from(trackMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([trackId, info]) => ({
      track_id: trackId,
      class_name: info.label,
      first_seen_s: info.firstSeen,
      last_seen_s: info.lastSeen,
      footpoint_in_zone: info.insideAnyZone,
      max_iou_zone:
        info.zonesInside.size > 0
          ? `${Array.from(info.zonesInside).join(', ')} (${info.count} obs)`
          : `Outside zones (${info.count} obs)`,
      observations_count: info.count,
      max_confidence: info.maxConf,
    }));

  // Map real agent trace entries
  const agentTrace: AgentTraceStep[] = (raw.trace || []).map((t, idx) => {
    const statusNorm = (t.status || '').toLowerCase();
    const stepStatus: AgentTraceStep['status'] =
      statusNorm === 'success' || statusNorm === 'ok' || statusNorm === 'completed'
        ? 'SUCCESS'
        : statusNorm === 'error' || statusNorm === 'failed'
        ? 'FAILURE'
        : 'RUNNING';

    const invocationIso =
      typeof t.started_at === 'number' && t.started_at > 1000000000 && t.started_at < 2000000000
        ? new Date(t.started_at * 1000).toISOString()
        : createdAt;

    return {
      step: idx + 1,
      call_id: t.call_id,
      tool: t.tool,
      invocation_time: invocationIso,
      duration_ms: Math.round((t.duration_ms || 0) * 100) / 100,
      input_summary: t.input ? JSON.stringify(t.input) : 'Standard tool parameters',
      result_summary: t.result_summary
        ? JSON.stringify(t.result_summary)
        : t.error
        ? `Error: ${t.error}`
        : 'Completed',
      status: stepStatus,
      next_action: t.next_action,
      influence_explanation: t.next_action
        ? `Next action triggered: ${t.next_action}`
        : 'Investigation sequence complete',
    };
  });

  const decision: InvestigationDecision = raw.report?.status || 'REVIEW';
  const uncertaintyLevel: InvestigationRecord['uncertainty_level'] =
    decision === 'REVIEW'
      ? 'HIGH'
      : decision === 'ALERT' && !raw.verification?.has_credible_crossing
      ? 'MEDIUM'
      : 'LOW';

  return {
    investigation_id: raw.analysis_id || raw.video_id,
    analysis_id: raw.analysis_id,
    video_id: raw.video_id,
    created_at: createdAt,
    is_simulated_reference: false,
    video_meta: {
      filename: options.filename,
      filesizeBytes: options.filesizeBytes,
      duration_seconds: Math.round((videoInfo.duration || 0) * 100) / 100,
      fps: videoInfo.fps,
      frame_count: videoInfo.frame_count,
      opencv_version: videoInfo.opencv_version,
      resolution: {
        width: videoInfo.width || 1920,
        height: videoInfo.height || 1080,
      },
    },
    zones: options.zones,
    status: raw.status === 'complete' ? 'COMPLETED' : raw.status === 'error' ? 'ERROR' : 'ANALYZING',
    decision,
    decision_reason: raw.report?.reason || `Analysis completed with status ${decision}`,
    uncertainty_level: uncertaintyLevel,
    events,
    tracks,
    agent_trace: agentTrace,
    evidence_frames_data: rawFrames,
    observations,
    raw_analysis: raw,
    local_video_url: options.localVideoUrl,
    annotated_video_url: `/api/analyses/${encodeURIComponent(raw.analysis_id)}/annotated`,
    report_download_url: `/api/analyses/${encodeURIComponent(raw.analysis_id)}/report`,
  };
}

export const api = {
  /**
   * 1. GET /api/health — Check FastAPI backend availability and OpenCV 5 support.
   */
  async checkHealth(): Promise<BackendHealthState> {
    const startTime = Date.now();
    const endpointDisplay = formatBackendEndpointForDisplay();

    try {
      const res = await fetch(buildEndpointUrl('/api/health'), {
        headers: getProxyHeaders({ Accept: 'application/json' }),
      });
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const apiErr = await parseErrorResponse(res, '/api/health');
        return {
          configured: true,
          connected: false,
          status: 'unreachable',
          statusCode: res.status,
          latencyMs,
          endpoint: endpointDisplay,
          error: apiErr.message,
          isCorsError: apiErr.isCorsError,
          checkedAt: new Date().toISOString(),
        };
      }

      const data = (await res.json()) as BackendHealthResponse & Record<string, unknown>;
      const isOk = Boolean(data.ok);

      return {
        configured: true,
        connected: isOk,
        status: isOk ? 'healthy' : 'unhealthy',
        statusCode: res.status,
        latencyMs,
        endpoint: endpointDisplay,
        opencv: data.opencv,
        data,
        checkedAt: new Date().toISOString(),
      };
    } catch (err: unknown) {
      const apiErr = detectCorsOrNetworkError(err, '/api/health');
      return {
        configured: true,
        connected: false,
        status: 'unreachable',
        latencyMs: Date.now() - startTime,
        endpoint: endpointDisplay,
        error: apiErr.message,
        isCorsError: apiErr.isCorsError,
        checkedAt: new Date().toISOString(),
      };
    }
  },

  /**
   * 2. POST /api/videos — Upload a workplace video or GIF to the FastAPI backend.
   */
  async uploadVideo(videoFile: File): Promise<BackendVideoUploadResponse> {
    const formData = new FormData();
    formData.append('file', videoFile);

    try {
      const res = await fetch(buildEndpointUrl('/api/videos'), {
        method: 'POST',
        headers: getProxyHeaders(),
        body: formData,
      });

      if (!res.ok) {
        throw await parseErrorResponse(res, '/api/videos');
      }

      return (await res.json()) as BackendVideoUploadResponse;
    } catch (err: unknown) {
      throw detectCorsOrNetworkError(err, '/api/videos');
    }
  },

  /**
   * 3. POST /api/analyze — Run OpenCV 5 + YOLOX analysis using uploaded video_id and configured zones.
   */
  async analyzeVideo(payload: BackendAnalyzeRequest): Promise<BackendAnalyzeResponse> {
    try {
      const res = await fetch(buildEndpointUrl('/api/analyze'), {
        method: 'POST',
        headers: getProxyHeaders({
          'Content-Type': 'application/json',
          Accept: 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw await parseErrorResponse(res, '/api/analyze');
      }

      return (await res.json()) as BackendAnalyzeResponse;
    } catch (err: unknown) {
      throw detectCorsOrNetworkError(err, '/api/analyze');
    }
  },

  /**
   * 4. GET /api/analyses/{analysis_id} — Retrieve analysis status/results.
   */
  async getAnalysisStatus(analysisId: string): Promise<BackendAnalysisStatusResponse> {
    const path = `/api/analyses/${encodeURIComponent(analysisId)}`;
    try {
      const res = await fetch(buildEndpointUrl(path), {
        headers: getProxyHeaders({ Accept: 'application/json' }),
      });

      if (!res.ok) {
        throw await parseErrorResponse(res, path);
      }

      return (await res.json()) as BackendAnalysisStatusResponse;
    } catch (err: unknown) {
      throw detectCorsOrNetworkError(err, path);
    }
  },

  /**
   * 5. GET /api/analyses/{analysis_id}/report — Retrieve the full JSON analysis report.
   */
  async getAnalysisReport(analysisId: string): Promise<BackendAnalyzeResponse> {
    const path = `/api/analyses/${encodeURIComponent(analysisId)}/report`;
    try {
      const res = await fetch(buildEndpointUrl(path), {
        headers: getProxyHeaders({ Accept: 'application/json' }),
      });

      if (!res.ok) {
        throw await parseErrorResponse(res, path);
      }

      return (await res.json()) as BackendAnalyzeResponse;
    } catch (err: unknown) {
      throw detectCorsOrNetworkError(err, path);
    }
  },

  /**
   * Full end-to-end investigation workflow:
   * 1. Upload video via POST /api/videos (or reuse existing upload result)
   * 2. Convert normalized zones to integer pixel coordinates using backend video dimensions
   * 3. Run analysis via POST /api/analyze
   * 4. Verify status via GET /api/analyses/{analysis_id} and fetch report via GET /api/analyses/{analysis_id}/report if needed
   */
  async startInvestigation(
    videoFile: File,
    zones: SafetyZone[],
    options?: {
      max_frames?: number;
      existingUpload?: BackendVideoUploadResponse;
      localVideoUrl?: string;
      onStageChange?: (stage: 'UPLOADING' | 'ANALYZING' | 'FETCHING_REPORT', detail?: string) => void;
    }
  ): Promise<InvestigationRecord> {
    // Step 1: Upload video if not already uploaded
    let uploadRes = options?.existingUpload;
    if (!uploadRes) {
      options?.onStageChange?.('UPLOADING', `Uploading ${videoFile.name} to POST /api/videos...`);
      uploadRes = await this.uploadVideo(videoFile);
    }

    const width = uploadRes.info?.width || 1920;
    const height = uploadRes.info?.height || 1080;
    const pixelZones = convertZonesToPixelPayloads(zones, width, height);

    if (pixelZones.length === 0 || pixelZones[0].polygon.length < 3) {
      throw new ZoneGuardApiError('At least one valid safety zone with 3+ vertices is required.');
    }

    // Step 2: Run analysis via POST /api/analyze
    options?.onStageChange?.(
      'ANALYZING',
      `Running YOLOX + OpenCV ${uploadRes.info?.opencv_version || '5.0.0'} analysis on video_id ${uploadRes.video_id}...`
    );

    const analyzePayload: BackendAnalyzeRequest = {
      video_id: uploadRes.video_id,
      polygon: pixelZones[0].polygon,
      zones: pixelZones,
      max_frames: options?.max_frames ?? 80,
    };

    let analyzeResult = await this.analyzeVideo(analyzePayload);

    // Step 3: If analysis is asynchronous or missing full report fields, check GET /api/analyses/{id} and /report
    if (analyzeResult.analysis_id) {
      const statusCheck = await this.getAnalysisStatus(analyzeResult.analysis_id).catch(() => null);
      if (statusCheck && statusCheck.status === 'complete' && !analyzeResult.report) {
        options?.onStageChange?.('FETCHING_REPORT', 'Retrieving incident report from GET /api/analyses/{id}/report...');
        analyzeResult = await this.getAnalysisReport(analyzeResult.analysis_id);
      }
    }

    return mapBackendAnalysisToRecord(analyzeResult, {
      filename: uploadRes.filename || videoFile.name,
      filesizeBytes: videoFile.size,
      zones,
      localVideoUrl: options?.localVideoUrl,
      uploadInfo: uploadRes.info,
    });
  },

  /**
   * Retrieve an existing analysis by analysis_id using GET /api/analyses/{analysis_id}
   * and GET /api/analyses/{analysis_id}/report.
   */
  async getInvestigation(analysisId: string, existingZones: SafetyZone[] = []): Promise<InvestigationRecord> {
    const statusRes = await this.getAnalysisStatus(analysisId);
    const reportRes = await this.getAnalysisReport(analysisId);

    const reconstructedZones: SafetyZone[] =
      existingZones.length > 0
        ? existingZones
        : (reportRes.scan?.zones || []).map((z, idx) => {
            const w = reportRes.scan?.video?.width || 1920;
            const h = reportRes.scan?.video?.height || 1080;
            return {
              id: z.id || `zone-${idx + 1}`,
              name: z.name || `Zone ${idx + 1}`,
              severity: z.severity || 'CRITICAL',
              points: (z.polygon || []).map(([px, py]) => ({
                x: Math.max(0, Math.min(1, px / Math.max(1, w))),
                y: Math.max(0, Math.min(1, py / Math.max(1, h))),
              })),
            };
          });

    const record = mapBackendAnalysisToRecord(reportRes, {
      filename: `${reportRes.video_id}.mp4`,
      zones: reconstructedZones,
    });

    if (statusRes.status && statusRes.status !== 'complete') {
      record.status = statusRes.status === 'error' ? 'ERROR' : 'ANALYZING';
    }

    return record;
  },

  /**
   * Fetch OpenAPI schema from the running backend to introspect available endpoints.
   */
  async getOpenApiSchema(): Promise<Record<string, unknown>> {
    const res = await fetch('/api/backend/openapi', {
      headers: getProxyHeaders({ Accept: 'application/json' }),
    });
    if (!res.ok) {
      throw await parseErrorResponse(res, '/openapi.json');
    }
    return res.json();
  },

  /**
   * URL for GET /api/analyses/{analysis_id}/report
   */
  getReportDownloadUrl(analysisId: string): string {
    return `${buildEndpointUrl(`/api/analyses/${encodeURIComponent(analysisId)}/report`)}?download=1`;
  },

  /**
   * URL for GET /api/analyses/{analysis_id}/annotated
   */
  getAnnotatedVideoUrl(analysisId: string, inline = false): string {
    const base = buildEndpointUrl(`/api/analyses/${encodeURIComponent(analysisId)}/annotated`);
    return inline ? `${base}?inline=1` : base;
  },

  /**
   * 6. POST /api/copilot/chat — Query ZoneGuard AI Copilot (server-side Gemini)
   */
  async copilotChat(payload: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    reportContext?: unknown;
    fileData?: {
      filename?: string;
      mimeType?: string;
      content?: string;
      base64?: string;
    };
  }): Promise<string> {
    const res = await fetch('/api/copilot/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorMsg = `Copilot request failed (HTTP ${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.error) errorMsg = errJson.error;
      } catch {
        // Fallback to status text
      }
      throw new Error(errorMsg);
    }

    const data = await res.json();
    return data.reply;
  },
};
