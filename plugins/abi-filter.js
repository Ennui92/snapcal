// Expo config plugin: restrict the release APK's native libraries to real
// phone architectures.
//
// By default Gradle packs FOUR ABIs into one universal APK: arm64-v8a,
// armeabi-v7a, x86 and x86_64. The two x86 variants exist only for emulators
// and nearly doubled the download (145MB). A 145MB sideload download is a
// classic "stuck at 100%" — the browser download or the package installer
// stalls on the large transfer.
//
// abiFilters (as opposed to splits.abi) keeps the build producing a SINGLE
// app-release.apk — so the CI step that copies app-release.apk still works —
// but only bundles the ABIs listed here. arm64-v8a covers every phone from
// roughly 2017 on; armeabi-v7a is kept for older 32-bit devices. This drops
// the APK to ~80MB with no loss of real-device coverage.
const { withAppBuildGradle } = require('expo/config-plugins');

const ABIS = "'arm64-v8a', 'armeabi-v7a'";

const NDK_BLOCK = `        ndk {
            abiFilters ${ABIS}
        }`;

module.exports = function withAbiFilter(config) {
  return withAppBuildGradle(config, (config) => {
    let src = config.modResults.contents;
    if (src.includes('abiFilters')) return config; // idempotent

    // Insert an ndk { abiFilters ... } block inside android.defaultConfig,
    // right after the versionName line that every RN defaultConfig has.
    const anchor = /(defaultConfig\s*\{[^}]*?versionName\s+["'][^"']*["'])/s;
    if (!anchor.test(src)) {
      throw new Error('abi-filter plugin: could not find defaultConfig.versionName anchor');
    }
    src = src.replace(anchor, `$1\n${NDK_BLOCK}`);
    config.modResults.contents = src;
    return config;
  });
};
