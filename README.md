# SnapCal 📸

Point. Shoot. Eat. A calorie tracker with almost zero interaction: open the app, photograph your food, put the phone away. The AI works out what you ate and how many calories it was, in the background.

**Landing page:** https://ennui92.github.io/snapcal/
**Download:** [latest Android APK](https://github.com/Ennui92/snapcal/releases/download/android-latest/snapcal.apk)

## Why it exists

Every calorie app dies the same death: too much typing. Search the food, pick the serving, adjust the grams, repeat three times a day until you quit. SnapCal's bet is that logging has to be as fast as taking a photo, because that is all it is.

- The app opens straight into the camera
- One tap logs the meal with the right time, day and meal type
- Gemini vision estimates the items, portions, calories and macros in the background
- Your hand in the photo works as the portion-size ruler (calibrated once during setup)
- Packaged products (that Lacta bar, that Coke can) are remembered in a local DB, so repeat foods are instant and consistent
- A big slider fixes "I only ate half of it" in two seconds
- Daily budget from your BMI/BMR and goal, computed once at setup: stay under the line and weight comes off
- Gentle nudges if a day runs hot ("maybe a yogurt tonight"), strictness is yours to pick
- Share your day/week/month as text
- Your food diary never leaves the phone: no account, no cloud database, no analytics
- Speaks English, Ελληνικά, Deutsch, Español and Français — picked automatically from the phone, changeable in settings; the AI describes meals in the same language
- A ten-second demo inside onboarding plus first-launch coach marks on the camera, so nobody has to guess how it works
- Fitness sync: connect **Strava** and/or **Google Health Connect** (Google Fit's successor — also covers Garmin, Samsung Health etc.) and tracked workout calories raise that day's budget. Move more, eat more. Apple Health lands with the iOS build.

## Architecture

Expo (React Native) + expo-router, SQLite on device, Gemini for vision.

```
src/
  app/            screens (camera is the home screen)
  lib/db.ts       SQLite: entries, items, known products, weights, activity days, profile
  lib/analyzer.ts photo -> Gemini -> items + kcal, retry queue, known-product merge
  lib/nutrition.ts BMR (Mifflin-St Jeor), TDEE, budget, pace curve, nudges
  lib/i18n.ts     five languages, device-locale default, choice persisted on device
  lib/activity.ts fitness sync orchestration + workout-aware daily budgets
  lib/strava.ts   Strava OAuth + per-day calorie sync (pure JS)
  lib/health-connect.ts  Google Health Connect reads (Android native module)
  locales/        en, el, de, es, fr dictionaries
  components/     budget ring, entry cards, onboarding demo, camera tour
```

Budget math with fitness sync: on a day with tracked workouts the budget is
rebuilt as sedentary TDEE + tracked burn (+ goal delta) instead of the static
activity multiplier from setup, so exercise never double-counts. When two
sources report the same day, the larger single number is used once.

Privacy model: photos are uploaded once to the Generative Language API for analysis and the response is stored locally. Nothing else ever leaves the device. The known-products cache lives on the phone too, which also keeps API usage (and cost) down since people eat the same things repeatedly.

## Building

```bash
npm install
echo "EXPO_PUBLIC_GEMINI_KEY=<your key>" > .env   # aistudio.google.com/apikey, or mint one on your own GCP project
# optional, enables the Strava connection in the built app (strava.com/settings/api,
# set the OAuth app's callback domain to `snapcal`):
echo "EXPO_PUBLIC_STRAVA_CLIENT_ID=<id>" >> .env
echo "EXPO_PUBLIC_STRAVA_CLIENT_SECRET=<secret>" >> .env
npx expo prebuild --platform android
cd android && ./gradlew :app:assembleRelease
```

Local release builds are signed with the shared local `preview.jks` (same keystore as the other Ermis apps; see `_control-panel` docs).

### CI

`.github/workflows/android-apk.yml` builds the release APK on every push to `main` (and on manual dispatch) and publishes it to the [`android-latest`](https://github.com/Ennui92/snapcal/releases/tag/android-latest) release — the download URL above. Pull requests get the same build published as a workflow artifact instead, so native/dependency breakage surfaces before merge. It needs the `EXPO_PUBLIC_GEMINI_KEY` repo secret; optionally set `EXPO_PUBLIC_STRAVA_CLIENT_ID` / `EXPO_PUBLIC_STRAVA_CLIENT_SECRET` to enable the Strava connection, and `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` (+ `ANDROID_KEY_PASSWORD`) to sign with `preview.jks` instead of the Expo debug keystore. Note: switching keystores changes the app signature, so a phone with an older differently-signed install needs an uninstall first.

## Scaling later

The client already prefers `EXPO_PUBLIC_ANALYZER_PROXY_URL` over a bundled key when set. To scale past personal use: deploy a thin proxy (Cloud Function / Supabase Edge Function) that holds the Gemini key server-side, set the URL in `.env`, ship a build with no key. Everything else (DB, UI, queue) already runs on-device and scales with the user count for free.

iOS: the codebase is plain Expo, `npx expo prebuild --platform ios` + EAS build when the time comes.

## Roadmap ideas

- Ruler-photo hand calibration (photograph your hand next to a ruler once, no measuring)
- Barcode fallback for packaged foods
- Weight trend chart vs. projected trend from the calorie balance
- Home screen widget with the remaining budget
