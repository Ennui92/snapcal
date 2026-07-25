// Social layer: capture a share-card to a PNG, hand it to the OS share sheet,
// and keep a record of what the user posted.
//
// LOCAL-ONLY for now — every post in `posts` (and every byte of the profile
// name/bio below) lives in this device's SQLite, same as everything else in
// db.ts. There is no shared/remote feed yet, no accounts, and nobody but the
// device owner can ever see a post: "feed" here means "your wall," a private
// scrapbook of images you generate and then share out through the OS share
// sheet. The owner already runs Firebase infra for other apps, so the natural
// next step is a Firestore-backed feed people can actually see each other's
// posts on, at which point `posts` and `profile_meta` both grow a `userId`
// and sync up instead of staying device-bound. To keep that swap cheap, the
// storage surface here is deliberately tiny and already async-shaped where it
// matters (capture/share are async; the store itself is sync today because
// SQLite is, but callers should treat addPost/getPosts/deletePost as if they
// could become network calls later).
import type { RefObject } from 'react';
import { Share, type View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as SQLite from 'expo-sqlite';
import { captureRef } from 'react-native-view-shot';

const db = SQLite.openDatabaseSync('snapcal.db');

export type Post = {
  id: number;
  kind: 'meal' | 'day';
  entryId: number | null;
  dayKey: string | null;
  caption: string;
  imageUri: string;
  createdAt: string; // ISO
};

let initialized = false;

/** Idempotent; safe to call from module load and again from a screen. */
export function initSocial() {
  if (initialized) return;
  initialized = true;
  db.execSync(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,
      entryId INTEGER,
      dayKey TEXT,
      caption TEXT NOT NULL DEFAULT '',
      imageUri TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS profile_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      displayName TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT ''
    );
    INSERT OR IGNORE INTO profile_meta (id) VALUES (1);
  `);
}

initSocial();

/** Renders a share card (already mounted off-screen) to a PNG file and
 * returns its file uri. Pixel ratio 3 so the acid-lime accent and mono type
 * stay crisp when someone zooms in on a story or a chat thread. */
export async function captureCard(ref: RefObject<View | null>): Promise<string> {
  // pixelRatio is a real, documented capture option; it's just missing from
  // this pinned version's CaptureOptions type, so it's passed via a loosely
  // typed variable rather than an inline literal to dodge excess-property
  // checking without an `any` cast.
  const options = { format: 'png' as const, quality: 1, result: 'tmpfile' as const, pixelRatio: 3 };
  return captureRef(ref, options);
}

/** Opens the OS share sheet for a captured PNG. Falls back to the plain
 * react-native Share API (text + url) if expo-sharing isn't available on
 * this device. */
export async function shareImage(uri: string, message?: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (available) {
    await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: message ?? 'Share' });
    return;
  }
  await Share.share({ url: uri, message: message ?? '' });
}

export function addPost(p: {
  kind: Post['kind']; entryId?: number | null; dayKey?: string | null; caption: string; imageUri: string;
}): number {
  const res = db.runSync(
    'INSERT INTO posts (kind, entryId, dayKey, caption, imageUri, createdAt) VALUES (?,?,?,?,?,?)',
    p.kind, p.entryId ?? null, p.dayKey ?? null, p.caption, p.imageUri, new Date().toISOString(),
  );
  return Number(res.lastInsertRowId);
}

export function getPosts(): Post[] {
  return db.getAllSync<Post>('SELECT * FROM posts ORDER BY createdAt DESC');
}

export function deletePost(id: number) {
  db.runSync('DELETE FROM posts WHERE id=?', id);
}

// --- profile identity (the part of "social" that genuinely works offline) ---
//
// A display name and one-line bio the user sets for themselves, shown on the
// /profile screen and baked into the profile share card. Local-only, same as
// everything else in this file — there is no username, no handle, nothing
// another device could look up.
export type ProfileMeta = { displayName: string; bio: string };

export function getProfileMeta(): ProfileMeta {
  return db.getFirstSync<ProfileMeta>('SELECT displayName, bio FROM profile_meta WHERE id = 1')
    ?? { displayName: '', bio: '' };
}

export function setProfileMeta(m: Partial<ProfileMeta>) {
  const cur = getProfileMeta();
  const next = { ...cur, ...m };
  db.runSync('UPDATE profile_meta SET displayName=?, bio=? WHERE id=1', next.displayName, next.bio);
}
