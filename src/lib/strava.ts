// Strava: OAuth in the system browser, tokens in the on-device meta table,
// burned calories summed per SnapCal day. Pure JS — works on every platform.
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET } from './config';
import { clearActivitySource, dayKeyFor, getMeta, setMeta, upsertActivityDay } from './db';

const API = 'https://www.strava.com/api/v3';
export const SOURCE = 'strava';

export const stravaConfigured = !!(STRAVA_CLIENT_ID && STRAVA_CLIENT_SECRET);

export function stravaConnected(): boolean {
  return !!getMeta('strava_refresh');
}

export function stravaAthlete(): string | null {
  return getMeta('strava_athlete');
}

async function tokenRequest(params: Record<string, string>): Promise<any> {
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: STRAVA_CLIENT_ID, client_secret: STRAVA_CLIENT_SECRET, ...params }),
  });
  if (!res.ok) throw new Error(`Strava auth failed (HTTP ${res.status})`);
  return res.json();
}

function storeTokens(d: any) {
  setMeta('strava_access', d.access_token ?? '');
  if (d.refresh_token) setMeta('strava_refresh', d.refresh_token);
  setMeta('strava_expires', String(d.expires_at ?? 0));
  if (d.athlete) {
    setMeta('strava_athlete', [d.athlete.firstname, d.athlete.lastname].filter(Boolean).join(' '));
  }
}

export async function connectStrava(): Promise<boolean> {
  const redirect = Linking.createURL('strava');
  const authUrl =
    'https://www.strava.com/oauth/mobile/authorize?' +
    new URLSearchParams({
      client_id: STRAVA_CLIENT_ID,
      redirect_uri: redirect,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: 'activity:read_all',
    }).toString();
  const res = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
  if (res.type !== 'success' || !res.url) return false;
  const code = Linking.parse(res.url).queryParams?.code;
  if (!code || typeof code !== 'string') return false;
  storeTokens(await tokenRequest({ code, grant_type: 'authorization_code' }));
  return true;
}

export async function disconnectStrava() {
  const access = getMeta('strava_access');
  if (access) {
    await fetch('https://www.strava.com/oauth/deauthorize', {
      method: 'POST',
      headers: { authorization: `Bearer ${access}` },
    }).catch(() => {});
  }
  for (const k of ['strava_access', 'strava_refresh', 'strava_expires', 'strava_athlete', 'strava_cal_cache']) {
    setMeta(k, '');
  }
  clearActivitySource(SOURCE);
}

async function accessToken(): Promise<string> {
  const refresh = getMeta('strava_refresh');
  if (!refresh) throw new Error('Strava is not connected');
  const expires = Number(getMeta('strava_expires') ?? 0);
  if (Date.now() / 1000 < expires - 60) return getMeta('strava_access')!;
  const d = await tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' });
  storeTokens(d);
  return d.access_token;
}

async function api(path: string, token: string): Promise<any> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Strava HTTP ${res.status}`);
  return res.json();
}

// Sum workout calories per SnapCal day for the last `days` days. The activity
// list endpoint has no calories, so each new activity costs one detail call;
// results are cached in meta so a re-sync only fetches what's new.
export async function syncStrava(days = 14): Promise<void> {
  const token = await accessToken();
  const after = Math.floor((Date.now() - days * 86400_000) / 1000);
  const list: any[] = await api(`/athlete/activities?after=${after}&per_page=100`, token);

  let cache: Record<string, number> = {};
  try { cache = JSON.parse(getMeta('strava_cal_cache') || '{}'); } catch {}

  const perDay = new Map<string, number>();
  for (const a of list.slice(0, 60)) {
    let kcal = cache[a.id];
    if (kcal == null) {
      const detail = await api(`/activities/${a.id}`, token);
      // Rides with power meters report kilojoules; ~1 kJ of work ≈ 1 kcal burned.
      kcal = detail.calories ?? detail.kilojoules ?? 0;
      cache[a.id] = kcal;
    }
    const day = dayKeyFor(new Date(a.start_date));
    perDay.set(day, (perDay.get(day) ?? 0) + kcal);
  }

  // Keep the cache bounded to what's still in the window.
  const liveIds = new Set(list.map(a => String(a.id)));
  cache = Object.fromEntries(Object.entries(cache).filter(([id]) => liveIds.has(id)));
  setMeta('strava_cal_cache', JSON.stringify(cache));

  // Upsert every day in the window (0 when nothing) so deleted workouts clear.
  const cursor = new Date();
  for (let i = 0; i < days; i++) {
    const day = dayKeyFor(cursor);
    upsertActivityDay({ dayKey: day, source: SOURCE, activeKcal: Math.round(perDay.get(day) ?? 0), steps: 0 });
    cursor.setDate(cursor.getDate() - 1);
  }
}
