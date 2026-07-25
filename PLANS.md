# SnapCal plans

Persistent record of what shipped, what is next, and why. Strategy and pricing
reasoning live in [docs/GTM.md](docs/GTM.md).

## Shipped

### v0.1.0 — 2026-07-15
Camera-first logger built from scratch. Camera opens on launch, one tap logs,
Gemini vision analyses in the background. On-device SQLite (entries, items,
known products, weights, profile). BMI/BMR onboarding with a daily budget,
hand-size portion calibration, percent-eaten slider, pace-aware nudges,
day/week/month history and share. GitHub Pages landing page.

### v0.2.0 — 2026-07-17
From phone testing feedback: manual entry with no photo, sugar tracked end to
end (with an in-place migration), editable entry time, uncropped entry photo,
Health Connect crash fixed, language switching no longer stale. Also landed in
parallel: five languages, onboarding demo, camera tour, Strava and Health
Connect sync with workout-aware budgets.

### v0.3.0 — 2026-07-17
**Darkroom design system.** The cream-and-emoji look read as generic. Replaced
with a dark, high-contrast identity: near-black surfaces, a single acid-lime
signal colour, tight corners, Archivo for display and IBM Plex Mono for every
number, a hand-drawn icon set replacing all emoji, the budget ring rebuilt as a
270° instrument arc with tick marks, log rows as a contact sheet, viewfinder
brackets on the camera, and a film-grain overlay.

### v0.4.0 — feature wave part 1 (2026-07-24, shipped)
Shipped: **AI coach chat** (/coach), **barcode scanning** (/scan), **recipe
suggestions** (/recipes), **intermittent fasting** (/fasting) — the four
independent leaf features, built by parallel subagents. Plus the shared
foundation: a **persistent bottom tab bar** (Diary / Stats / Camera / Coach /
More) that makes home and every feature one tap away, a quick-actions row on
Diary, and the **freemium split** (premium.ts reverse-trial gating, /plus
paywall, settings plan card, a real free-tier scan limit on the camera).
Deferred to v0.5.0: see the "next" list below.

### v0.5.0 — light & dark themes (2026-07-24, shipped)
Full light theme alongside the dark default, switchable in Settings >
Appearance (Dark / Light / System, persisted). New palette system
(DARK/LIGHT + Palette type), ThemeProvider + useColors()/useThemeMode(), and
every screen migrated to the `makeStyles(C)` pattern (camera stays dark on
purpose). Light uses a deep-green accent (lime is unreadable on white).

### v0.6.0 — the competitive wave (2026-07-25)
Built after blunt owner feedback on v0.5.0. Every item below was a specific
complaint, not a nice-to-have:

- **"Barcode scanning doesn't work for Greece."** It only queried Open Food
  Facts' world endpoint, which is thin on Greek products. Replaced with a
  cascade resolver: local catalogue cache → a bundled seed catalogue of common
  Greek/EU supermarket products → country-aware Open Food Facts (`gr.` before
  `world.`) → **AI fallback that reads the nutrition label from a photo**.
  Everything resolved from any source is written into the on-device catalogue,
  so it is instant and offline next time and the database grows per user.
- **"Manual adding has no gallery button and no voice."** The add screen now
  leads with *Speak it* (record → Gemini transcribes and extracts the items in
  one call → editable confirm) and *From gallery* (pick an older photo, set the
  day/time so it lands correctly, analysed in the background).
- **"Fitness calories aren't integrated anywhere; daily summary only in
  settings; lame and weak."** Today is now a real dashboard: calories **in vs
  out vs net** from the connected fitness provider, steps, coloured macro bars
  (protein/carbs/fat/sugar), and a live fasting strip.
- **"No fasting mode."** It existed but was invisible. Now it is on the Today
  dashboard (running timer or one-tap start) and in the quick actions.
- **"Stats are lame and no colors."** Rebuilt with a real chart set.
- **"Diary mode and photo diary mode, I don't see it."** New `/diary` with a
  BeReal-style photo journal (hero + grid, time and kcal badges) and a list mode.
- **"Social feed is just text."** Now posts a *meal* or a *day* as a designed,
  branded share image, which is also the growth loop.
- **Oura**: it reports through Google Health Connect, which the app already
  reads. Now named explicitly in the connections copy (all 5 languages).
- Navigation overhaul so none of this is buried: tab bar is Today · Photos ·
  [Camera] · Stats · Feed, plus a quick-action row on Today.

#### Known gaps after v0.6.0 (be honest about these)
- **The feed is local-only.** Posts and share images live on the device. It is
  a sharing/growth loop, not yet a social network. A shared feed needs a
  backend; Firebase is the obvious next step and `social.ts` is structured so
  the store can be swapped for a synced one.
- **Catalogue is ~17,350 bundled products** (v0.6.1), built from the official
  Open Food Facts export rather than the rate-limited search API: every
  Greek-tagged product that actually carries nutrition data (1,967), Cyprus
  (383), and the 15,000 most-scanned products worldwide by `unique_scans_n`
  (so Nutella, Barilla, Coca-Cola and friends resolve offline too). Verified in
  SQLite: 17,170 rows after dedup, inserted in 37ms.
- **Greece's real ceiling in Open Food Facts is ~2k products, not 11k.** The
  API reports 11,434 Greek-tagged items, but ~83% have no nutrition data at
  all — they are photo- or name-only records. Converting kJ to kcal recovered
  only 9 more. The AI label reader is what covers the rest.
- **Verified live 2026-07-25:** the `gr.openfoodfacts.org` subdomain returns
  the same data as `world.` (one database, localized view), so the country
  routing is not itself extra coverage. What actually fixes Greece is the
  offline seed plus the AI label reader.
- **Not device-tested.** Everything typechecks and bundles; the new screens
  have not been exercised on a physical phone.

### v0.4.0+ — feature wave part 2 (queued)
Big feature push requested from competitor-app reference shots (Cal AI coach,
SnapCalorie photo journal, MyFitnessPal voice logging). Sequenced by conflict
surface, since this is a single RN app where theme/nav/db/locales are shared:

- **Foundation (done by hand, one coherent pass):** light + dark themes with a
  toggle; easier home navigation (persistent bottom tab bar); premium-gating
  module + paywall; a consolidated DB migration.
- **Independent leaf features (parallel subagents, new files only):** AI coach
  chat (`/coach`), barcode scanning (`/scan`), recipe/next-meal suggestions
  (`/recipes`), intermittent fasting mode (`/fasting`). Each owns its own
  screen + lib + (where needed) its own SQLite table; the orchestrator wires
  routes, nav entries, and premium gating.
- **Orchestrator-owned features:** upload-a-photo-later; diary vs photo-diary
  view modes; Oura ring (rides in through Google Health Connect — verify +
  label, likely no new integration); better stats (weight-trend chart, streak,
  macro breakdowns); voice logging (record → Gemini transcription → entry;
  needs a native audio module so it is managed centrally); social feed of
  day/meal posts (needs a backend → Firebase, largest item, scoped last).
- **Freemium / premium split:** free = 3 AI scans/day + unlimited reuse of
  learned foods + core logging + last 7 days; premium = unlimited scans, coach
  chat, recipes, barcode, voice, full history + weight trend, fasting insights,
  fitness sync, social, themes. Reverse-trial model per docs/GTM.md.

## Next, in order

Sequenced by what blocks revenue, per GTM section 2. The first four are hard
blockers for any public launch.

1. **Move the Gemini key server-side.** It currently ships inside the APK and
   can be extracted. Thin proxy (Cloud Function or Supabase Edge Function),
   per-install rate limiting, and the natural enforcement point for free vs
   paid metering. `EXPO_PUBLIC_ANALYZER_PROXY_URL` is already supported by the
   client. **Nothing else should ship publicly before this.**
2. **Google Play listing**, localised into all five languages. Needs a privacy
   policy, data safety declaration, and a "not medical advice" line.
3. **Billing via RevenueCat**: reverse trial (7 days full, then metered free),
   €4.99/mo, €24.99/yr, €49.99 lifetime with a fair-use scan cap.
4. **iOS build.** Plain Expo already, so an EAS build plus a developer account.

Then, for retention rather than launch:

5. Encrypted backup and restore (also the headline premium feature).
6. Weight trend chart — the data is already collected and never shown.
7. Habit loop: log reminder, home screen widget, streak notifications.
8. Barcode fallback for packaged food.
9. Share cards instead of plain text.

## Open question worth settling early

**Is the accuracy claim true?** The whole position rests on hand calibration
plus the local product library beating a naked photo estimate. Untested.
Weigh ~30 typical meals, log each with and without a hand in frame, compare
against the weighed truth. If it holds, it is the marketing story. If it does
not, the honest position falls back to speed and privacy, and pricing has to
come down with it.

## Deferred, deliberately

- **Ruler-photo hand calibration** (photograph your hand next to a ruler rather
  than measuring it). Nice, but the typed measurement works.
- **Micronutrients.** Cronometer owns that audience and it is not our fight.
- **Social or friends features.** Not until retention is proven.
