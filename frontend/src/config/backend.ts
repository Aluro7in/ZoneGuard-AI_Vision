/**
 * Centralized FastAPI Backend Configuration for ZoneGuard.
 *
 * All frontend and server-side proxy calls reference this single configuration
 * module so the backend base URL is never scattered or hardcoded across files.
 */

export const DEFAULT_BACKEND_BASE_URL =
  'https://prix-needle-gamma-mrs.trycloudflare.com';

/**
 * Resolves the configured FastAPI backend base URL across browser (Vite) and
 * Node.js (server.ts) runtimes.
 */
export function getConfiguredBackendBaseUrl(): string {
  const isObsoleteUrl = (url: string) =>
    url.includes('again-savannah-amsterdam-evaluate');

  if (typeof process !== 'undefined' && process.env) {
    const serverEnv =
      process.env.ZONEGUARD_BACKEND_URL || process.env.VITE_API_BASE_URL;
    if (serverEnv && serverEnv.trim() && !isObsoleteUrl(serverEnv)) {
      return serverEnv.trim().replace(/\/+$/, '');
    }
  }

  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, string> })
      .env;
    if (metaEnv) {
      const clientEnv =
        metaEnv.VITE_API_BASE_URL || metaEnv.VITE_ZONEGUARD_BACKEND_URL;
      if (clientEnv && clientEnv.trim() && !isObsoleteUrl(clientEnv)) {
        return clientEnv.trim().replace(/\/+$/, '');
      }
    }
  } catch {
    // Ignore when import.meta is unavailable
  }

  return DEFAULT_BACKEND_BASE_URL;
}

/**
 * Formats a backend URL for clean UI display (hostname + protocol).
 */
export function formatBackendEndpointForDisplay(
  rawUrl: string = getConfiguredBackendBaseUrl()
): string {
  try {
    const parsed = new URL(rawUrl);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return rawUrl;
  }
}
