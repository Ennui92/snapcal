// DM the latest build link via the MyDicord bot (same flow as the other apps).
// Token/user come from env, falling back to the local "MyDicord bot/.env".
//   node scripts/send-build-link.mjs "<message>"
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadFallbackEnv() {
  try {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'MyDicord bot', '.env');
    const out = {};
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}

const fallback = loadFallbackEnv();
const TOKEN = process.env.DISCORD_BOT_TOKEN || fallback.DISCORD_BOT_TOKEN;
const USER_ID = process.env.DISCORD_USER_ID || fallback.DISCORD_USER_ID;
if (!TOKEN || !USER_ID) {
  console.error('Missing DISCORD_BOT_TOKEN / DISCORD_USER_ID');
  process.exit(1);
}

const message = process.argv[2] ||
  'SnapCal build: https://github.com/Ennui92/snapcal/releases/download/android-latest/snapcal.apk';

const API = 'https://discord.com/api/v10';
const headers = { authorization: `Bot ${TOKEN}`, 'content-type': 'application/json' };

const chRes = await fetch(`${API}/users/@me/channels`, {
  method: 'POST', headers, body: JSON.stringify({ recipient_id: USER_ID }),
});
const channel = await chRes.json();
if (!channel.id) { console.error('DM channel failed:', channel); process.exit(1); }

const msgRes = await fetch(`${API}/channels/${channel.id}/messages`, {
  method: 'POST', headers, body: JSON.stringify({ content: message }),
});
const msg = await msgRes.json();
if (!msg.id) { console.error('send failed:', msg); process.exit(1); }
console.log('DM sent, message id', msg.id);
