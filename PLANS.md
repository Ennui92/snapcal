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
