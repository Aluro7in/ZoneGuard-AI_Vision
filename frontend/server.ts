import dotenv from 'dotenv';
dotenv.config({ override: true });
import express, { type Request, type Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';
import FormData from 'form-data';
import { GoogleGenAI } from '@google/genai';
import {
  getConfiguredBackendBaseUrl,
  formatBackendEndpointForDisplay,
} from './src/config/backend.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const portEnv = process.env.PORT;
const PORT = portEnv && !isNaN(parseInt(portEnv, 10)) ? parseInt(portEnv, 10) : 3000;

// Body parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer memory storage for video uploads (max 150MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 150 * 1024 * 1024 },
});

function resolveBackendUrl(req?: Request): string {
  const headerOverride = req?.headers['x-zoneguard-backend-url'];
  if (typeof headerOverride === 'string' && headerOverride.trim()) {
    return headerOverride.trim().replace(/\/+$/, '');
  }
  return getConfiguredBackendBaseUrl();
}

// ---------------- Real FastAPI Backend Endpoints ----------------

// 1. GET /api/health — Direct FastAPI health check
app.get('/api/health', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(`${backendUrl}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      res.status(response.status).send(text);
      return;
    }
    res.status(response.status).json(json);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to reach FastAPI backend';
    res.status(502).json({
      ok: false,
      detail: `Failed to reach FastAPI backend at ${formatBackendEndpointForDisplay(backendUrl)}: ${message}`,
    });
  }
});

// 1b. GET /api/backend/health — Enriched diagnostics health check for UI status & latency
app.get('/api/backend/health', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  if (!backendUrl) {
    res.json({
      configured: false,
      connected: false,
      status: 'unconfigured',
      message: 'Backend base URL is not configured.',
      checkedAt: new Date().toISOString(),
    });
    return;
  }

  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(`${backendUrl}/api/health`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    const latencyMs = Date.now() - startTime;
    const rawText = await response.text();
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      data = { raw: rawText };
    }

    const isOk = response.ok && data.ok !== false;
    const opencv = data.opencv as
      | { version: string; supported: boolean; error: string | null }
      | undefined;

    res.json({
      configured: true,
      connected: isOk,
      statusCode: response.status,
      status: isOk ? 'healthy' : 'unhealthy',
      latencyMs,
      endpoint: formatBackendEndpointForDisplay(backendUrl),
      opencv,
      data,
      checkedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown connection error';
    res.json({
      configured: true,
      connected: false,
      status: 'unreachable',
      latencyMs: Date.now() - startTime,
      endpoint: formatBackendEndpointForDisplay(backendUrl),
      error: errorMsg,
      checkedAt: new Date().toISOString(),
    });
  }
});

// 2. GET /api/backend/openapi — Live OpenAPI schema introspection
app.get('/api/backend/openapi', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(`${backendUrl}/openapi.json`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      res.status(response.status).json({
        error: `Backend returned status ${response.status} when fetching /openapi.json`,
      });
      return;
    }

    const schema = await response.json();
    res.json(schema);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to reach backend';
    res.status(502).json({ error: 'Failed to fetch /openapi.json', details: errorMsg });
  }
});

// 3. POST /api/videos — Upload video file (multipart/form-data field "file")
app.post('/api/videos', upload.any(), async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  const files = req.files as Express.Multer.File[] | undefined;
  const uploadedFile = files && files.length > 0 ? files[0] : undefined;

  if (!uploadedFile) {
    res.status(400).json({ detail: 'Missing video file in multipart upload (expected field "file").' });
    return;
  }

  try {
    const form = new FormData();
    form.append('file', uploadedFile.buffer, {
      filename: uploadedFile.originalname,
      contentType: uploadedFile.mimetype || 'video/mp4',
    });

    const forwardHeaders = form.getHeaders() as Record<string, string>;
    const response = await fetch(`${backendUrl}/api/videos`, {
      method: 'POST',
      body: new Uint8Array(form.getBuffer()),
      headers: forwardHeaders,
    });

    const text = await response.text();
    try {
      const json = JSON.parse(text);
      res.status(response.status).json(json);
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error uploading video to FastAPI backend';
    res.status(502).json({
      detail: `Failed to upload video to ${formatBackendEndpointForDisplay(backendUrl)}: ${errorMsg}`,
    });
  }
});

// 4. POST /api/analyze — Run analysis using uploaded video_id and configured polygon zones
app.post('/api/analyze', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  try {
    const controller = new AbortController();
    // Allow up to 180 seconds for YOLOX + OpenCV 5 video analysis
    const timeout = setTimeout(() => controller.abort(), 180000);

    const response = await fetch(`${backendUrl}/api/analyze`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    clearTimeout(timeout);

    const text = await response.text();
    try {
      const json = JSON.parse(text);
      res.status(response.status).json(json);
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error running analysis on FastAPI backend';
    res.status(502).json({
      detail: `Analysis request to ${formatBackendEndpointForDisplay(backendUrl)} failed: ${errorMsg}`,
    });
  }
});

// 5. GET /api/analyses/:analysis_id — Retrieve analysis status/results
app.get('/api/analyses/:analysis_id', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  const { analysis_id } = req.params;

  try {
    const response = await fetch(
      `${backendUrl}/api/analyses/${encodeURIComponent(analysis_id)}`,
      { headers: { Accept: 'application/json' } }
    );
    const text = await response.text();
    try {
      const json = JSON.parse(text);
      res.status(response.status).json(json);
    } catch {
      res.status(response.status).send(text);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch analysis status';
    res.status(502).json({ detail: errorMsg });
  }
});

// 6. GET /api/analyses/:analysis_id/report — Retrieve analysis JSON report
app.get('/api/analyses/:analysis_id/report', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  const { analysis_id } = req.params;

  try {
    const response = await fetch(
      `${backendUrl}/api/analyses/${encodeURIComponent(analysis_id)}/report`,
      { headers: { Accept: 'application/json' } }
    );

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).send(errText || 'Report not available from backend');
      return;
    }

    const reportData = await response.json();
    res.setHeader('Content-Type', 'application/json');
    if (req.query.download === '1') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(analysis_id)}-report.json"`
      );
    }
    res.json(reportData);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve analysis report';
    res.status(502).json({ detail: errorMsg });
  }
});

// 7. GET /api/analyses/:analysis_id/annotated — Retrieve annotated MP4 video
app.get('/api/analyses/:analysis_id/annotated', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  const { analysis_id } = req.params;

  try {
    const targetUrl = `${backendUrl}/api/analyses/${encodeURIComponent(analysis_id)}/annotated`;
    const response = await fetch(targetUrl);

    if (!response.ok) {
      const errText = await response.text();
      res.status(response.status).send(errText || 'Annotated video not available from backend');
      return;
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    res.setHeader('Content-Type', contentType);

    if (req.query.inline === '1') {
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(analysis_id)}-annotated.mp4"`
      );
    } else {
      const backendDisposition = response.headers.get('content-disposition');
      res.setHeader(
        'Content-Disposition',
        backendDisposition || `attachment; filename="${encodeURIComponent(analysis_id)}-annotated.mp4"`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve annotated video';
    res.status(502).json({ detail: errorMsg });
  }
});

// Legacy result endpoints supported by FastAPI backend
app.get('/api/results/:video_id/report', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  const { video_id } = req.params;
  try {
    const response = await fetch(`${backendUrl}/api/results/${encodeURIComponent(video_id)}/report`);
    if (!response.ok) {
      res.status(response.status).send(await response.text());
      return;
    }
    const data = await response.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(video_id)}-report.json"`);
    res.json(data);
  } catch (err: unknown) {
    res.status(502).json({ detail: err instanceof Error ? err.message : 'Failed to fetch report' });
  }
});

app.get('/api/results/:video_id/annotated', async (req: Request, res: Response) => {
  const backendUrl = resolveBackendUrl(req);
  const { video_id } = req.params;
  try {
    const response = await fetch(`${backendUrl}/api/results/${encodeURIComponent(video_id)}/annotated`);
    if (!response.ok) {
      res.status(response.status).send(await response.text());
      return;
    }
    res.setHeader('Content-Type', response.headers.get('content-type') || 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(video_id)}-annotated.mp4"`);
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err: unknown) {
    res.status(502).json({ detail: err instanceof Error ? err.message : 'Failed to fetch annotated video' });
  }
});

// ---------------- ZoneGuard AI Copilot (Server-Side Gemini) ----------------
let genAIClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!genAIClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY environment variable is not configured. Please set it in Settings > Secrets.'
      );
    }
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

app.post('/api/copilot/chat', async (req: Request, res: Response) => {
  try {
    const { messages, reportContext, fileData } = req.body as {
      messages?: Array<{ role: 'user' | 'assistant'; content: string }>;
      reportContext?: unknown;
      fileData?: {
        filename?: string;
        mimeType?: string;
        content?: string;
        base64?: string;
      };
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'Missing messages array in request body.' });
      return;
    }

    const ai = getGenAI();

    const systemInstruction = `You are ZoneGuard Copilot, an expert AI safety analyst specializing in workplace, logistics, and warehouse video safety investigations.
Your role is to assist occupational health and safety (EHS) managers, floor supervisors, and forensic auditors in interpreting ZoneGuard agentic visual safety inspection results.

Core Grounding Rules:
1. Base your analysis strictly on the supplied investigation report data, attachments, and user queries.
2. Distinguish established visual facts (e.g., confirmed pedestrian footpoint crossings, detected bounding boxes, verified dwell intervals, exact timestamps, keyframe evidence) from interpretations or recommendations.
3. Clearly explain investigation outcomes:
   - ALERT: High-confidence, verified pedestrian breach across the designated hazard polygon.
   - CLEAR: All tracked entities verified outside the hazard perimeter.
   - REVIEW: Ambiguous visual evidence, occlusion, brief boundary clipping, or borderline footpoint placement that requires human safety supervisor verification before sign-off.
4. Detail the agentic visual tool trace (e.g., initial scan -> zoom/crop -> temporal track verification -> final verdict).
5. Never fabricate incidents, track IDs, timestamps, or statistics not provided in the data.
6. Provide practical, defensible safety recommendations, corrective actions, and incident report summaries formatted cleanly with Markdown headings, lists, and bold text.`;

    // Build context prefix
    const contextParts: string[] = [];
    if (reportContext) {
      const formattedReport =
        typeof reportContext === 'string'
          ? reportContext
          : JSON.stringify(reportContext, null, 2);
      contextParts.push(
        `[CURRENT INVESTIGATION REPORT CONTEXT]\n${formattedReport}\n[/CURRENT INVESTIGATION REPORT CONTEXT]`
      );
    }

    if (fileData) {
      if (fileData.content) {
        contextParts.push(
          `[ATTACHED SAFETY DOCUMENT: ${fileData.filename || 'report'}]\n${fileData.content}\n[/ATTACHED SAFETY DOCUMENT]`
        );
      }
    }

    const contextPrefix = contextParts.length > 0 ? `${contextParts.join('\n\n')}\n\n` : '';

    // Convert messages to Gemini contents format
    // Map 'assistant' role to 'model'
    const contents = messages.map((m, idx) => {
      const isLatestUserMessage = idx === messages.length - 1 && m.role === 'user';
      const text = isLatestUserMessage ? `${contextPrefix}${m.content}` : m.content;

      const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
        { text },
      ];

      // If image attachment on latest user message
      if (isLatestUserMessage && fileData?.base64 && fileData?.mimeType?.startsWith('image/')) {
        parts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64,
          },
        });
      }

      return {
        role: m.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    const candidateModels = ['gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let reply = '';
    let lastError: unknown = null;

    for (const model of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0.2,
          },
        });
        if (response.text) {
          reply = response.text;
          break;
        }
      } catch (err: unknown) {
        lastError = err;
        console.warn(`Model ${model} returned error, trying fallback...`, err instanceof Error ? err.message : err);
      }
    }

    if (!reply && lastError) {
      throw lastError;
    }

    res.json({ reply: reply || 'Analysis complete. No additional visual risks flagged.' });
  } catch (err: unknown) {
    console.error('ZoneGuard Copilot Gemini error:', err);
    const message = err instanceof Error ? err.message : 'Failed to query Gemini API';
    res.status(500).json({
      error: `ZoneGuard Copilot failed: ${message}`,
    });
  }
});

// ---------------- Vite / Static Assets ----------------
async function startServer() {
  const distInSubdir = path.resolve(__dirname, 'dist');
  const distPath = fs.existsSync(path.resolve(distInSubdir, 'index.html'))
    ? distInSubdir
    : fs.existsSync(path.resolve(__dirname, 'assets'))
    ? __dirname
    : distInSubdir;

  const hasBuiltAssets = fs.existsSync(path.resolve(distPath, 'index.html'));
  const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.K_SERVICE);

  if (isProd && hasBuiltAssets) {
    console.log(`ZoneGuard serving static production assets from: ${distPath}`);
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    console.log('ZoneGuard starting Vite development middleware...');
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    const backend = getConfiguredBackendBaseUrl();
    console.log(`ZoneGuard server successfully listening at http://0.0.0.0:${PORT}`);
    console.log(`ZoneGuard backend target: ${formatBackendEndpointForDisplay(backend)}`);
  });

  const handleShutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down ZoneGuard HTTP server...`);
    server.close(() => {
      console.log('ZoneGuard HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Failed to start ZoneGuard server:', err);
  process.exit(1);
});
