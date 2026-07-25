// Expo config plugin: build the release APK for real phones only, not a
// bloated universal APK.
//
// By default the build packs FOUR ABIs (arm64-v8a, armeabi-v7a, x86, x86_64).
// The two x86 variants are emulator-only and nearly doubled the download to
// 145MB — a classic "stuck at 100%" sideload. We keep only the two phone ABIs.
//
// IMPORTANT: React Native's own Gradle plugin decides which .so libraries to
// package from the `reactNativeArchitectures` GRADLE PROPERTY, and that wins
// over a `ndk.abiFilters` block in build.gradle. So the property is the real
// lever; we set abiFilters too as belt-and-suspenders. Using the property (not
// splits.abi) keeps the build producing a single app-release.apk, so the CI
// step that copies app-release.apk is unchanged.
const { withGradleProperties, withAppBuildGradle } = require('expo/config-plugins');

const ARCHES = 'arm64-v8a,armeabi-v7a';
const ABIS_GRADLE = "'arm64-v8a', 'armeabi-v7a'";

function withArchProperty(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const existing = props.find(p => p.type === 'property' && p.key === 'reactNativeArchitectures');
    if (existing) {
      existing.value = ARCHES;
    } else {
      props.push({ type: 'property', key: 'reactNativeArchitectures', value: ARCHES });
    }
    return config;
  });
}

function withAbiFilters(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes('abiFilters')) return config; // idempotent
    const anchor = /(defaultConfig\s*\{[^}]*?versionName\s+["'][^"']*["'])/s;
    if (anchor.test(src)) {
      src = src.replace(anchor, `$1\n        ndk {\n            abiFilters ${ABIS_GRADLE}\n        }`);
      config.modResults.contents = src;
    }
    return config;
  });
}

module.exports = function withAbiFilter(config) {
  config = withArchProperty(config);
  config = withAbiFilters(config);
  return config;
};
