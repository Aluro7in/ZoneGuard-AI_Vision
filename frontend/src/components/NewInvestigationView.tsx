import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Video,
  FileVideo,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Layers,
  ArrowRight,
  Loader2,
  RefreshCw,
  Check,
  Shield,
  Eye,
} from 'lucide-react';
import {
  SafetyZone,
  VideoMetadata,
  BackendHealthState,
  BackendVideoUploadResponse,
} from '../types/zoneguard';
import { ZoneEditor } from './ZoneEditor';
import { api } from '../services/api';

interface NewInvestigationViewProps {
  health: BackendHealthState | null;
  onStartAnalysis: (
    videoFile: File,
    zones: SafetyZone[],
    options?: {
      existingUpload?: BackendVideoUploadResponse;
      localVideoUrl?: string;
      max_frames?: number;
    }
  ) => Promise<void>;
  isAnalyzing: boolean;
  analysisStageText?: string | null;
  onOpenDiagnostics: () => void;
}

export const NewInvestigationView: React.FC<NewInvestigationViewProps> = ({
  health,
  onStartAnalysis,
  isAnalyzing,
  analysisStageText,
  onOpenDiagnostics,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [frameImageUrl, setFrameImageUrl] = useState<string | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Real POST /api/videos state
  const [isUploadingVideo, setIsUploadingVideo] = useState(false);
  const [uploadedVideo, setUploadedVideo] = useState<BackendVideoUploadResponse | null>(null);
  const [maxFrames, setMaxFrames] = useState<number>(80);

  // Safety Zones state
  const [zones, setZones] = useState<SafetyZone[]>([]);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  // Guided Workflow Stepper (1: Upload -> 2: Zones -> 3: Review -> 4: Analyzing)
  const currentStep = isAnalyzing
    ? 4
    : zones.length > 0 && selectedFile
    ? 3
    : selectedFile
    ? 2
    : 1;

  // Revoke object URL on unmount
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    void processFile(file);
  };

  const uploadToFastApi = async (file: File) => {
    setIsUploadingVideo(true);
    setUploadError(null);
    try {
      const response = await api.uploadVideo(file);
      setUploadedVideo(response);
      setVideoMeta((prev) => ({
        filename: response.filename || file.name,
        filesizeBytes: file.size,
        duration_seconds: Math.round((response.info.duration || prev?.duration_seconds || 0) * 10) / 10,
        fps: Math.round((response.info.fps || 0) * 10) / 10,
        frame_count: response.info.frame_count,
        opencv_version: response.info.opencv_version,
        resolution: {
          width: response.info.width || prev?.resolution.width || 1920,
          height: response.info.height || prev?.resolution.height || 1080,
        },
      }));
    } catch (err: unknown) {
      setUploadedVideo(null);
      setUploadError(
        err instanceof Error
          ? `POST /api/videos upload failed: ${err.message}`
          : 'Failed to upload video to FastAPI backend.'
      );
    } finally {
      setIsUploadingVideo(false);
    }
  };

  const processFile = async (file: File) => {
    setUploadError(null);
    setUploadedVideo(null);
    setFrameImageUrl(null);

    const MAX_SIZE = 150 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setUploadError(
        `File exceeds maximum size of 150MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`
      );
      return;
    }

    const validExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.gif'];
    const validMimes = [
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'image/gif',
    ];
    const fileNameLower = file.name.toLowerCase();
    const isExtValid = validExtensions.some((ext) => fileNameLower.endsWith(ext));
    const isMimeValid = validMimes.includes(file.type);

    if (!isExtValid && !isMimeValid) {
      setUploadError(
        'Unsupported file type. Please upload MP4, WebM, QuickTime MOV, AVI, MKV, or GIF.'
      );
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);

    if (fileNameLower.endsWith('.gif') || file.type === 'image/gif') {
      setFrameImageUrl(objectUrl);
    }

    setVideoMeta({
      filename: file.name,
      filesizeBytes: file.size,
      duration_seconds: 0,
      resolution: { width: 1920, height: 1080 },
    });

    // Upload immediately to POST /api/videos on the FastAPI backend
    await uploadToFastApi(file);
  };

  const captureFirstFrame = () => {
    const vid = videoPreviewRef.current;
    if (!vid || vid.videoWidth === 0 || vid.videoHeight === 0) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = vid.videoWidth;
      canvas.height = vid.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        setFrameImageUrl(canvas.toDataURL('image/jpeg', 0.88));
      }
    } catch {
      // Ignore canvas error
    }
  };

  const handleVideoMetadataLoaded = () => {
    const vid = videoPreviewRef.current;
    if (!vid || !selectedFile) return;

    setVideoMeta((prev) => ({
      filename: prev?.filename || selectedFile.name,
      filesizeBytes: selectedFile.size,
      duration_seconds:
        prev?.duration_seconds && prev.duration_seconds > 0
          ? prev.duration_seconds
          : Math.round((vid.duration || 0) * 10) / 10,
      fps: prev?.fps,
      frame_count: prev?.frame_count,
      opencv_version: prev?.opencv_version,
      resolution: {
        width: prev?.resolution.width || vid.videoWidth || 1920,
        height: prev?.resolution.height || vid.videoHeight || 1080,
      },
    }));

    if (vid.duration > 0.1) {
      vid.currentTime = Math.min(0.2, vid.duration / 2);
    } else {
      captureFirstFrame();
    }
  };

  const resetSelection = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setFrameImageUrl(null);
    setVideoMeta(null);
    setUploadedVideo(null);
    setZones([]);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files?.[0]) {
      void processFile(e.dataTransfer.files[0]);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) {
      setUploadError('Please select or drag-and-drop a video file first.');
      return;
    }
    if (zones.length === 0) {
      setUploadError('Please define at least one polygon safety zone before initiating inspection.');
      return;
    }

    const invalidZone = zones.find((z) => z.points.length < 3);
    if (invalidZone) {
      setUploadError(
        `Zone "${invalidZone.name}" has fewer than 3 vertices. Please complete or delete it.`
      );
      return;
    }

    setUploadError(null);
    await onStartAnalysis(selectedFile, zones, {
      existingUpload: uploadedVideo || undefined,
      localVideoUrl: previewUrl || undefined,
      max_frames: maxFrames,
    });
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b-2 border-slate-800">
        <div>
          <h2 className="text-base font-black text-slate-100 flex items-center gap-2 font-mono uppercase tracking-tight">
            <Video className="w-5 h-5 text-cyan-400" />
            New Safety Investigation Setup
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Guided video upload and perimeter polygon configuration for OpenCV 5.0.0 YOLOX inspection
          </p>
        </div>

        {selectedFile && (
          <button
            type="button"
            onClick={resetSelection}
            disabled={isUploadingVideo || isAnalyzing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-700 rounded transition-colors disabled:opacity-50 font-semibold"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Setup</span>
          </button>
        )}
      </div>

      {/* 4-Stage Progressive Workflow Stepper */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div
          className={`p-3 border-2 rounded-lg transition-all neo-shadow-sm ${
            currentStep >= 1
              ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200'
              : 'border-slate-800 bg-slate-900/40 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">01 Upload Video</span>
            {selectedFile ? <Check className="w-4 h-4 text-cyan-400" /> : <Upload className="w-4 h-4" />}
          </div>
          <span className="text-[11px] text-slate-400 block truncate">
            {selectedFile ? selectedFile.name : 'Select MP4/WebM/GIF'}
          </span>
        </div>

        <div
          className={`p-3 border-2 rounded-lg transition-all neo-shadow-sm ${
            currentStep >= 2
              ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200'
              : 'border-slate-800 bg-slate-900/40 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">02 Define Zones</span>
            {zones.length > 0 ? <Check className="w-4 h-4 text-cyan-400" /> : <Layers className="w-4 h-4" />}
          </div>
          <span className="text-[11px] text-slate-400 block">
            {zones.length} zone{zones.length === 1 ? '' : 's'} configured
          </span>
        </div>

        <div
          className={`p-3 border-2 rounded-lg transition-all neo-shadow-sm ${
            currentStep >= 3
              ? 'border-cyan-400 bg-cyan-950/30 text-cyan-200'
              : 'border-slate-800 bg-slate-900/40 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">03 Review Config</span>
            {currentStep >= 3 ? <Check className="w-4 h-4 text-cyan-400" /> : <Eye className="w-4 h-4" />}
          </div>
          <span className="text-[11px] text-slate-400 block">
            Parameters confirmed
          </span>
        </div>

        <div
          className={`p-3 border-2 rounded-lg transition-all neo-shadow-sm ${
            currentStep === 4
              ? 'border-cyan-400 bg-cyan-950/40 text-cyan-200 animate-pulse'
              : 'border-slate-800 bg-slate-900/40 text-slate-500'
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold">04 Run Analysis</span>
            {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : <Shield className="w-4 h-4" />}
          </div>
          <span className="text-[11px] text-slate-400 block truncate">
            {isAnalyzing ? 'YOLOX Inspection…' : 'Awaiting launch'}
          </span>
        </div>
      </div>

      {/* Stage 1: File Upload Box */}
      {!selectedFile ? (
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className="p-12 border-2 border-dashed border-slate-700 hover:border-cyan-400 rounded-xl bg-slate-900/50 hover:bg-slate-900/80 transition-all text-center cursor-pointer space-y-4 neo-shadow"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".mp4,.webm,.mov,.avi,.mkv,.gif"
            onChange={handleFileChange}
            className="hidden"
          />

          <div className="w-14 h-14 rounded-sm bg-cyan-950 border-2 border-cyan-400 text-cyan-400 flex items-center justify-center mx-auto neo-shadow-sm">
            <Upload className="w-7 h-7" />
          </div>

          <div className="space-y-1.5">
            <h3 className="text-base font-bold text-slate-100">
              Drop workplace footage here, or browse files
            </h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Supports MP4, WebM, QuickTime MOV, AVI, MKV, or GIF up to 150MB. Uploads directly to the OpenCV 5.0.0 detector pipeline.
            </p>
          </div>

          <div className="pt-2">
            <span className="inline-block px-4 py-2 text-xs font-black uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-sm transition-all border-2 border-slate-950 neo-shadow-sm">
              Browse Surveillance Videos
            </span>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-xl neo-shadow-sm flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-sm bg-cyan-950 border-2 border-cyan-400 flex items-center justify-center text-cyan-400 shrink-0 neo-shadow-sm">
              {isUploadingVideo ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FileVideo className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-black text-slate-100 font-mono">
                  {videoMeta?.filename}
                </span>
                {isUploadingVideo ? (
                  <span className="text-[10px] font-mono font-bold text-cyan-300 bg-cyan-950 border border-cyan-500/40 px-2 py-0.5 rounded-sm">
                    Uploading video file…
                  </span>
                ) : uploadedVideo ? (
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950 border border-emerald-500/40 px-2 py-0.5 rounded-sm">
                    Uploaded · ID: {uploadedVideo.video_id.slice(0, 10)}…
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950 border border-amber-500/40 px-2 py-0.5 rounded-sm">
                    Pending Backend Upload
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-1">
                Size: <strong className="text-slate-200">{formatFileSize(videoMeta?.filesizeBytes)}</strong>
                {' · '}
                Duration: <strong className="text-slate-200">{videoMeta?.duration_seconds}s</strong>
                {' · '}
                Resolution: <strong className="text-slate-200">{videoMeta?.resolution.width}×{videoMeta?.resolution.height}</strong>
                {videoMeta?.fps ? ` · ${videoMeta.fps} FPS` : ''}
                {videoMeta?.frame_count ? ` · ${videoMeta.frame_count} frames` : ''}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isUploadingVideo && !uploadedVideo && selectedFile && (
              <button
                type="button"
                onClick={() => void uploadToFastApi(selectedFile)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-cyan-300 bg-cyan-950 hover:bg-cyan-900 rounded border border-cyan-500/40 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Upload</span>
              </button>
            )}
            <button
              type="button"
              disabled={isUploadingVideo || isAnalyzing}
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors disabled:opacity-50"
            >
              Replace File
            </button>
          </div>
        </div>
      )}

      {/* Hidden Video for frame extraction */}
      {previewUrl && (
        <video
          ref={videoPreviewRef}
          src={previewUrl}
          muted
          playsInline
          onLoadedMetadata={handleVideoMetadataLoaded}
          onSeeked={captureFirstFrame}
          onLoadedData={captureFirstFrame}
          className="hidden"
        />
      )}

      {/* Error Banner */}
      {uploadError && (
        <div className="p-3.5 bg-red-950/40 border-2 border-red-500 rounded-lg flex items-center justify-between gap-3 text-xs text-red-200 neo-shadow-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{uploadError}</span>
          </div>
          {selectedFile && !isUploadingVideo && !uploadedVideo && (
            <button
              type="button"
              onClick={() => void uploadToFastApi(selectedFile)}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-red-900/80 border border-red-500 rounded text-red-100 shrink-0"
            >
              Retry Upload
            </button>
          )}
        </div>
      )}

      {/* Stage 2: Polygon Zone Editor */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b-2 border-slate-800">
          <div>
            <h3 className="text-xs font-black text-slate-100 flex items-center gap-2 font-mono uppercase tracking-tight">
              <Layers className="w-4 h-4 text-cyan-400" />
              Safety Perimeter Polygon Editor
            </h3>
            <p className="text-[11px] text-slate-400">
              Click on the preview to place polygon vertices. Polygons map to video coordinates for OpenCV 5 inspection.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-mono text-slate-400 font-bold">
              <span>Max Sampled Frames:</span>
              <input
                type="number"
                min={1}
                max={240}
                value={maxFrames}
                onChange={(e) =>
                  setMaxFrames(Math.max(1, Math.min(240, parseInt(e.target.value, 10) || 80)))
                }
                className="w-16 px-2 py-1 bg-slate-950 border-2 border-slate-700 rounded text-slate-200 text-xs font-mono tabular-nums focus:outline-none focus:border-cyan-400"
              />
            </label>
            <span className="text-xs font-mono text-cyan-400 font-bold">
              {zones.length} configured
            </span>
          </div>
        </div>

        <ZoneEditor
          zones={zones}
          onZonesChange={setZones}
          videoResolution={videoMeta?.resolution}
          activeZoneId={activeZoneId}
          onSelectZone={setActiveZoneId}
          previewImageUrl={frameImageUrl || undefined}
        />
      </div>

      {/* Stage 3: Review Configuration Summary before launch */}
      {selectedFile && zones.length > 0 && (
        <div className="p-4 bg-slate-900 border-2 border-slate-800 rounded-xl neo-shadow-sm space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-black uppercase font-mono tracking-wider text-slate-200">
              Inspection Parameters Review
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
            <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-bold">Video Input</span>
              <span className="text-slate-200 truncate block font-semibold">{selectedFile.name}</span>
            </div>

            <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-bold">Exclusion Zones</span>
              <span className="text-cyan-300 block font-semibold">
                {zones.map((z) => `${z.name} [${z.severity}]`).join(', ')}
              </span>
            </div>

            <div className="p-2.5 bg-slate-950 rounded border border-slate-800">
              <span className="text-[10px] text-slate-500 uppercase block font-bold">Inference Budget</span>
              <span className="text-slate-200 block font-semibold">{maxFrames} frames sampled</span>
            </div>
          </div>
        </div>
      )}

      {/* Launch Action Bar */}
      <div className="p-5 bg-slate-900 border-2 border-slate-800 rounded-xl neo-shadow flex flex-wrap items-center justify-between gap-4">
        <div>
          {health?.connected ? (
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono font-bold">
              <CheckCircle2 className="w-4 h-4" />
              <span>Vision Engine Ready ({health.endpoint})</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-amber-400 font-mono font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Backend Offline / Checking</span>
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-0.5">
            {isAnalyzing
              ? analysisStageText || 'Executing YOLOX detector, pedestrian footpoint math, and agentic trace…'
              : uploadedVideo && zones.length > 0
              ? `Ready to run investigation across ${zones.length} zone(s).`
              : 'Complete steps 01 and 02 to launch the safety inspection.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {!health?.connected && (
            <button
              type="button"
              onClick={onOpenDiagnostics}
              className="px-3.5 py-2 text-xs font-bold text-slate-300 bg-slate-800 hover:bg-slate-700 border-2 border-slate-700 rounded-sm transition-colors"
            >
              Open Diagnostics
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleStartAnalysis()}
            disabled={isAnalyzing || isUploadingVideo || !selectedFile || zones.length === 0}
            className={`inline-flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-wider rounded-sm transition-all border-2 border-slate-950 neo-shadow-sm ${
              !isAnalyzing && !isUploadingVideo && selectedFile && zones.length > 0
                ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 cursor-pointer active:translate-x-0.5 active:translate-y-0.5'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-60'
            }`}
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Running Safety Investigation…</span>
              </>
            ) : (
              <>
                <span>Launch Safety Investigation</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
