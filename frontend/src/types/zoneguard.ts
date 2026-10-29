/**
 * ZoneGuard TypeScript Definitions
 * Includes exact FastAPI backend contracts and normalized UI investigation models.
 */

export type InvestigationDecision = 'ALERT' | 'CLEAR' | 'REVIEW';
export type InvestigationStatus = 'IDLE' | 'UPLOADING' | 'QUEUED' | 'ANALYZING' | 'COMPLETED' | 'ERROR';
export type ZoneSeverity = 'CRITICAL' | 'WARNING' | 'CAUTION';
export type EventType = 'ZONE_ENTRY' | 'ZONE_EXIT' | 'DWELL_EXCEEDED' | 'UNCERTAIN_CROSSING';
export type VerificationStatus = 'VERIFIED' | 'UNCONFIRMED' | 'AMBIGUOUS';
export type ReviewDecision = 'PENDING_OPERATOR_SIGN_OFF' | 'CONFIRMED' | 'FALSE_ALARM' | 'DISMISSED';

export interface Point2D {
  x: number; // Normalized 0.0 to 1.0 relative to video width
  y: number; // Normalized 0.0 to 1.0 relative to video height
}

export interface SafetyZone {
  id: string;
  name: string;
  severity: ZoneSeverity;
  points: Point2D[];
  color?: string;
  description?: string;
}

export interface VideoMetadata {
  filename: string;
  filesizeBytes?: number;
  duration_seconds: number;
  fps?: number;
  frame_count?: number;
  opencv_version?: string;
  resolution: {
    width: number;
    height: number;
  };
}

// ---------------- FastAPI Backend Exact Models ----------------

export interface BackendHealthResponse {
  ok: boolean;
  opencv?: {
    version: string;
    supported: boolean;
    error: string | null;
  };
}

export interface BackendVideoInfo {
  width: number;
  height: number;
  fps: number;
  frame_count: number;
  duration: number;
  opencv_version: string;
}

export interface BackendVideoUploadResponse {
  video_id: string;
  filename: string;
  info: BackendVideoInfo;
}

export interface BackendZonePayload {
  id: string;
  name: string;
  severity?: ZoneSeverity;
  polygon: Array<[number, number]>; // Pixel coordinates [[x, y], ...]
}

export interface BackendAnalyzeRequest {
  video_id: string;
  polygon: Array<[number, number]>; // Primary zone pixel coordinates [[x, y], ...]
  zones?: BackendZonePayload[] | null;
  max_frames?: number; // 1..240, default 80
}

export interface BackendObservation {
  frame: number;
  timestamp: number;
  track_id: number;
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h]
  inside_zone: boolean;
  footpoint: [number, number]; // [x, y]
  zones?: Array<{
    zone_id: string;
    zone_name: string;
    inside: boolean;
  }>;
}

export interface BackendEvidenceFrame {
  timestamp: number;
  frame: number;
  image: string; // data:image/jpeg;base64,... or image URL
}

export interface BackendCrossing {
  event_type: string; // 'entry' | 'exit' | ...
  track_id: number;
  start: number;
  end?: number;
  duration?: number;
  evidence_count?: number;
  confidence: number;
  zone_id?: string;
}

export interface BackendTraceEntry {
  call_id: string;
  tool: string;
  input?: Record<string, unknown>;
  started_at?: number;
  status: string;
  duration_ms: number;
  result_summary?: Record<string, unknown>;
  error?: string;
  next_action?: string;
}

export interface BackendAnalyzeResponse {
  video_id: string;
  analysis_id: string;
  status: string;
  scan?: {
    video: BackendVideoInfo;
    detector: string;
    observations: BackendObservation[];
    candidate_tracks: number[];
    zones: BackendZonePayload[];
  };
  evidence?: {
    count: number;
    frames?: BackendEvidenceFrame[];
  };
  verification?: {
    crossings?: BackendCrossing[];
    exits?: BackendCrossing[];
    initial_occupancy?: Array<{
      track_id: number;
      start: number;
      evidence_count: number;
      confidence: number;
      zone_id?: string;
    }>;
    occupancy_count: number;
    has_credible_crossing: boolean;
    credible_crossings?: BackendCrossing[];
    by_zone?: Record<
      string,
      {
        crossings?: BackendCrossing[];
        exits?: BackendCrossing[];
        initial_occupancy?: Array<{
          track_id: number;
          start: number;
          evidence_count: number;
          confidence: number;
        }>;
        occupancy_count: number;
        has_credible_crossing: boolean;
        credible_crossings?: BackendCrossing[];
      }
    >;
  };
  motion?: {
    motion?: Array<{ timestamp: number; motion_pixels: number }>;
    zone_motion?: boolean;
  };
  report: {
    status: InvestigationDecision;
    alert: boolean;
    incidents: BackendCrossing[];
    reason: string;
  };
  trace: BackendTraceEntry[];
}

export interface BackendAnalysisStatusResponse {
  analysis_id: string;
  video_id: string;
  status: string;
  report?: BackendAnalyzeResponse['report'];
  scan?: BackendAnalyzeResponse['scan'];
  evidence?: BackendAnalyzeResponse['evidence'];
  verification?: BackendAnalyzeResponse['verification'];
  trace?: BackendTraceEntry[];
}

// ---------------- UI Investigation Models ----------------

export interface ZoneEvent {
  id: string;
  timestamp_seconds: number;
  end_timestamp_seconds?: number;
  duration_seconds?: number;
  zone_id: string;
  zone_name: string;
  event_type: EventType;
  track_id: number;
  confidence: number;
  evidence_count?: number;
  verification_status: VerificationStatus;
  evidence_frames: string[];
  reason_explanation: string;
  review_state: ReviewDecision;
  reviewer_notes?: string;
  reviewed_at?: string;
  reviewed_by?: string;
}

export interface TrackSummary {
  track_id: number;
  class_name: 'person' | 'forklift' | 'automated_guided_vehicle' | 'pallet_jack' | string;
  first_seen_s: number;
  last_seen_s: number;
  max_iou_zone: string;
  footpoint_in_zone: boolean;
  observations_count?: number;
  max_confidence?: number;
}

export interface AgentTraceStep {
  step: number;
  call_id?: string;
  tool: string;
  invocation_time: string;
  duration_ms: number;
  input_summary: string;
  result_summary: string;
  status: 'SUCCESS' | 'FAILURE' | 'RUNNING';
  next_action?: string;
  influence_explanation: string;
}

export interface InvestigationRecord {
  investigation_id: string;
  analysis_id: string;
  video_id: string;
  created_at: string;
  is_simulated_reference?: boolean;
  simulation_label?: string;
  video_meta: VideoMetadata;
  zones: SafetyZone[];
  status: InvestigationStatus;
  decision: InvestigationDecision;
  decision_reason: string;
  uncertainty_level: 'LOW' | 'MEDIUM' | 'HIGH';
  events: ZoneEvent[];
  tracks: TrackSummary[];
  agent_trace: AgentTraceStep[];
  evidence_frames_data?: BackendEvidenceFrame[];
  observations?: BackendObservation[];
  raw_analysis?: BackendAnalyzeResponse;
  local_video_url?: string;
  error_message?: string;
  annotated_video_url?: string;
  report_download_url?: string;
}

export interface BackendHealthState {
  configured: boolean;
  connected: boolean;
  status: 'healthy' | 'unhealthy' | 'unreachable' | 'unconfigured';
  statusCode?: number;
  latencyMs?: number;
  endpoint?: string;
  opencv?: {
    version: string;
    supported: boolean;
    error: string | null;
  };
  message?: string;
  error?: string;
  isCorsError?: boolean;
  data?: Record<string, unknown>;
  checkedAt: string;
}
