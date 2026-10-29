import React, { useRef, useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Shield,
  Layers,
} from 'lucide-react';
import { BackendObservation, SafetyZone, ZoneEvent } from '../types/zoneguard';

export interface VideoPlayerHandle {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  getCurrentTime: () => number;
}

interface VideoPlayerProps {
  videoUrl?: string;
  fallbackVideoUrl?: string;
  zones?: SafetyZone[];
  events?: ZoneEvent[];
  observations?: BackendObservation[];
  sourceResolution?: { width: number; height: number };
  activeEventId?: string | null;
  onTimeUpdate?: (currentTime: number) => void;
  onEventClick?: (eventId: string) => void;
  fallbackPosterUrl?: string;
}

export const VideoPlayer = forwardRef<VideoPlayerHandle, VideoPlayerProps>(({
  videoUrl,
  fallbackVideoUrl,
  zones = [],
  events = [],
  observations = [],
  sourceResolution,
  activeEventId,
  onTimeUpdate,
  onEventClick,
  fallbackPosterUrl,
}, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasOverlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeSrc, setActiveSrc] = useState<string | undefined>(videoUrl || fallbackVideoUrl);
  const [usingFallbackSrc, setUsingFallbackSrc] = useState(false);
  const [videoPlaybackFailed, setVideoPlaybackFailed] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showZoneOverlays, setShowZoneOverlays] = useState(true);
  const [videoDimensions, setVideoDimensions] = useState(
    sourceResolution || { width: 1920, height: 1080 }
  );

  useEffect(() => {
    setActiveSrc(videoUrl || fallbackVideoUrl);
    setUsingFallbackSrc(!videoUrl && Boolean(fallbackVideoUrl));
    setVideoPlaybackFailed(false);
  }, [videoUrl, fallbackVideoUrl]);

  useImperativeHandle(ref, () => ({
    seekTo: (seconds: number) => {
      if (videoRef.current) {
        videoRef.current.currentTime = Math.max(0, Math.min(seconds, duration || 100));
        setCurrentTime(videoRef.current.currentTime);
      }
    },
    play: () => {
      videoRef.current?.play().catch(() => {});
    },
    pause: () => {
      videoRef.current?.pause();
    },
    getCurrentTime: () => videoRef.current?.currentTime || 0,
  }));

  const togglePlay = () => {
    if (!videoRef.current || videoPlaybackFailed) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  };

  const handleLoadedMetadata = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration || 0);
    if (videoRef.current.videoWidth > 0) {
      setVideoDimensions({
        width: videoRef.current.videoWidth,
        height: videoRef.current.videoHeight,
      });
    }
  };

  const handleVideoError = () => {
    // OpenCV's mp4v fourcc stream may not decode natively in some browsers;
    // fall back to the local uploaded video with live Canvas zone + YOLOX observation overlays
    if (!usingFallbackSrc && fallbackVideoUrl && activeSrc !== fallbackVideoUrl) {
      setUsingFallbackSrc(true);
      setActiveSrc(fallbackVideoUrl);
      return;
    }
    setVideoPlaybackFailed(true);
  };

  const handleTimeUpdateInternal = () => {
    if (!videoRef.current) return;
    const cur = videoRef.current.currentTime;
    setCurrentTime(cur);
    onTimeUpdate?.(cur);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const targetTime = parseFloat(e.target.value);
    setCurrentTime(targetTime);
    if (videoRef.current && !videoPlaybackFailed) {
      videoRef.current.currentTime = targetTime;
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [0.5, 1, 1.5, 2];
    const nextIndex = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIndex];
    setPlaybackRate(nextRate);
    if (videoRef.current) {
      videoRef.current.playbackRate = nextRate;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00.0';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  // Render Polygon Overlays and synchronized YOLOX Observations on Canvas
  const drawOverlay = useCallback(() => {
    const canvas = canvasOverlayRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!showZoneOverlays) return;

    // 1. Draw configured safety zones
    zones.forEach((zone) => {
      if (zone.points.length < 3) return;

      const isCritical = zone.severity === 'CRITICAL';
      const strokeColor = isCritical ? '#ef4444' : zone.severity === 'WARNING' ? '#f59e0b' : '#06b6d4';
      const fillColor = isCritical ? 'rgba(239, 68, 68, 0.16)' : 'rgba(245, 158, 11, 0.16)';

      ctx.save();
      ctx.beginPath();
      const first = zone.points[0];
      ctx.moveTo(first.x * canvas.width, first.y * canvas.height);

      for (let i = 1; i < zone.points.length; i++) {
        const pt = zone.points[i];
        ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      }
      ctx.closePath();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();

      const centroid = zone.points.reduce(
        (acc, p) => ({ x: acc.x + p.x / zone.points.length, y: acc.y + p.y / zone.points.length }),
        { x: 0, y: 0 }
      );
      ctx.fillStyle = '#0f172a';
      ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
      const text = zone.name;
      const textW = ctx.measureText(text).width;
      ctx.fillRect(centroid.x * canvas.width - textW / 2 - 6, centroid.y * canvas.height - 10, textW + 12, 20);
      ctx.strokeStyle = strokeColor;
      ctx.strokeRect(centroid.x * canvas.width - textW / 2 - 6, centroid.y * canvas.height - 10, textW + 12, 20);

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, centroid.x * canvas.width, centroid.y * canvas.height);

      ctx.restore();
    });

    // 2. Draw synchronized YOLOX bounding boxes & footpoints when observations are available
    if (observations.length > 0 && videoDimensions.width > 0 && videoDimensions.height > 0) {
      const activeObs = observations.filter((o) => Math.abs(o.timestamp - currentTime) <= 0.18);
      activeObs.forEach((obs) => {
        const [bx, by, bw, bh] = obs.bbox;
        const scaleX = canvas.width / videoDimensions.width;
        const scaleY = canvas.height / videoDimensions.height;

        const rx = bx * scaleX;
        const ry = by * scaleY;
        const rw = bw * scaleX;
        const rh = bh * scaleY;

        const color = obs.inside_zone ? '#ef4444' : '#22d3ee';

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);

        // Footpoint marker
        if (obs.footpoint && obs.footpoint.length === 2) {
          const fx = obs.footpoint[0] * scaleX;
          const fy = obs.footpoint[1] * scaleY;
          ctx.beginPath();
          ctx.arc(fx, fy, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }

        // Track ID label
        const label = `#${obs.track_id} ${obs.label} ${(obs.confidence * 100).toFixed(0)}%`;
        ctx.font = '600 10px JetBrains Mono, monospace';
        const lw = ctx.measureText(label).width;
        ctx.fillStyle = '#090d16';
        ctx.fillRect(rx, Math.max(0, ry - 16), lw + 8, 16);
        ctx.fillStyle = color;
        ctx.fillText(label, rx + 4, Math.max(11, ry - 4));
        ctx.restore();
      });
    }
  }, [showZoneOverlays, zones, observations, currentTime, videoDimensions]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasOverlayRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        canvasOverlayRef.current.width = rect.width;
        canvasOverlayRef.current.height = rect.height;
        drawOverlay();
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [drawOverlay]);

  return (
    <div
      ref={containerRef}
      className="relative bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col group"
    >
      {/* Viewport Frame */}
      <div className="relative aspect-video w-full bg-slate-950 flex items-center justify-center overflow-hidden">
        {activeSrc && !videoPlaybackFailed ? (
          <video
            ref={videoRef}
            src={activeSrc}
            poster={fallbackPosterUrl}
            muted={isMuted}
            playsInline
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdateInternal}
            onError={handleVideoError}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
            className="w-full h-full object-contain"
          />
        ) : fallbackPosterUrl ? (
          <img
            src={fallbackPosterUrl}
            alt="Extracted keyframe preview"
            referrerPolicy="no-referrer"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 text-xs gap-2 p-6 text-center">
            <Shield className="w-10 h-10 text-slate-700 stroke-[1.5]" />
            <span className="font-semibold text-slate-400">Forensic Video Workspace Ready</span>
            <span className="max-w-md text-slate-500">
              Annotated video stream and synchronized safety zone overlays will render here.
            </span>
          </div>
        )}

        {/* Dynamic Canvas Overlay for Zones & Observations */}
        <canvas
          ref={canvasOverlayRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
        />

        {/* Center Play Button Overlay */}
        {activeSrc && !videoPlaybackFailed && !isPlaying && (
          <button
            onClick={togglePlay}
            className="absolute inset-0 m-auto w-14 h-14 bg-slate-950/70 border border-cyan-400/40 rounded-full flex items-center justify-center text-cyan-300 hover:scale-105 transition-transform z-20 shadow-lg backdrop-blur-sm"
            aria-label="Play video"
          >
            <Play className="w-6 h-6 ml-0.5" />
          </button>
        )}
      </div>

      {/* Scrubber with Event Marker Pins */}
      <div className="px-3 pt-2 bg-slate-900 border-t border-slate-800">
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.05}
            value={currentTime}
            onChange={handleSeekChange}
            aria-label="Video scrubber"
            className="w-full h-1.5 bg-slate-800 accent-cyan-400 rounded-lg cursor-pointer appearance-none z-20"
          />

          {duration > 0 &&
            events.map((evt) => {
              const leftPercent = Math.min(100, Math.max(0, (evt.timestamp_seconds / duration) * 100));
              const isEventActive = activeEventId === evt.id;
              const isAlert = evt.verification_status === 'VERIFIED';

              return (
                <div
                  key={evt.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (videoRef.current && !videoPlaybackFailed) {
                      videoRef.current.currentTime = evt.timestamp_seconds;
                    }
                    setCurrentTime(evt.timestamp_seconds);
                    onEventClick?.(evt.id);
                  }}
                  title={`${evt.event_type} (${formatTime(evt.timestamp_seconds)}) - ${evt.zone_name}`}
                  className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full cursor-pointer z-30 transition-transform ${
                    isEventActive ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'
                  } ${isAlert ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]' : 'bg-amber-400'}`}
                  style={{ left: `calc(${leftPercent}% - 6px)` }}
                />
              );
            })}
        </div>
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900 text-xs text-slate-300">
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            disabled={!activeSrc || videoPlaybackFailed}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-200 transition-colors disabled:opacity-40"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              if (videoRef.current && !videoPlaybackFailed) {
                videoRef.current.currentTime = 0;
              }
              setCurrentTime(0);
            }}
            disabled={!activeSrc || videoPlaybackFailed}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-40"
            title="Restart playback"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          <span className="font-mono text-slate-400 tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowZoneOverlays(!showZoneOverlays)}
            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-[11px] font-mono transition-colors ${
              showZoneOverlays
                ? 'bg-cyan-950/50 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Overlays ({zones.length})</span>
          </button>

          <button
            type="button"
            onClick={cyclePlaybackRate}
            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[11px] font-mono tabular-nums text-slate-300 transition-colors"
            title="Cycle playback rate"
          >
            {playbackRate}x
          </button>

          {videoDimensions.width > 0 && (
            <span className="hidden sm:inline text-[11px] font-mono text-slate-500">
              {videoDimensions.width}×{videoDimensions.height}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

VideoPlayer.displayName = 'VideoPlayer';
