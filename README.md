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

## Architecture

Expo (React Native) + expo-router, SQLite on device, Gemini for vision.

```
src/
  app/            screens (camera is the home screen)
  lib/db.ts       SQLite: entries, items, known products, weights, profile
  lib/analyzer.ts photo -> Gemini -> items + kcal, retry queue, known-product merge
  lib/nutrition.ts BMR (Mifflin-St Jeor), TDEE, budget, pace curve, nudges
  components/     budget ring, entry cards, big friendly buttons
```

Privacy model: photos are uploaded once to the Generative Language API for analysis and the response is stored locally. Nothing else ever leaves the device. The known-products cache lives on the phone too, which also keeps API usage (and cost) down since people eat the same things repeatedly.

## Building

```bash
npm install
echo "EXPO_PUBLIC_GEMINI_KEY=<your key>" > .env   # aistudio.google.com/apikey, or mint one on your own GCP project
npx expo prebuild --platform android
cd android && ./gradlew :app:assembleRelease
```

The release build is signed with the shared local `preview.jks` (same keystore as the other Ermis apps; see `_control-panel` docs). CI/EAS can be added later, the app is plain managed Expo.

## Scaling later

The client already prefers `EXPO_PUBLIC_ANALYZER_PROXY_URL` over a bundled key when set. To scale past personal use: deploy a thin proxy (Cloud Function / Supabase Edge Function) that holds the Gemini key server-side, set the URL in `.env`, ship a build with no key. Everything else (DB, UI, queue) already runs on-device and scales with the user count for free.

iOS: the codebase is plain Expo, `npx expo prebuild --platform ios` + EAS build when the time comes.

## Roadmap ideas

- Ruler-photo hand calibration (photograph your hand next to a ruler once, no measuring)
- Barcode fallback for packaged foods
- Weight trend chart vs. projected trend from the calorie balance
- Home screen widget with the remaining budget
