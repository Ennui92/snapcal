// AI + app configuration.
//
// The Gemini key is injected at bundle time from .env (EXPO_PUBLIC_GEMINI_KEY,
// gitignored) and is restricted to the Generative Language API only. Food
// photos go to Gemini for analysis and nowhere else; all logs stay in the
// on-device SQLite DB.
//
// Scaling later: point ANALYZER_PROXY_URL at a server (Cloud Function or
// Supabase Edge Function) that holds the key server-side, and ship builds
// with no key at all. The client already prefers the proxy when set.
export const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_KEY ?? '';
export const ANALYZER_PROXY_URL = process.env.EXPO_PUBLIC_ANALYZER_PROXY_URL ?? '';

export const MODEL_PRIMARY = 'gemini-3-flash-preview';
export const MODEL_FALLBACK = 'gemini-3.1-flash-lite';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Photos are downscaled to this width before upload: plenty for recognition,
// keeps the request small and fast on mobile data.
export const UPLOAD_WIDTH = 1024;
export const UPLOAD_JPEG_QUALITY = 0.7;

export const AVERAGE_HAND_CM = 18.5;
