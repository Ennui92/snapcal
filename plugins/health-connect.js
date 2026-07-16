// Expo config plugin for react-native-health-connect: adds the manifest
// pieces Health Connect requires beyond raw permissions —
//  - a <queries> entry so the app can see the Health Connect package (Android 13-)
//  - the permissions-rationale intent filter on MainActivity (Android 13-)
//  - the ViewPermissionUsageActivity alias (Android 14+)
// and registers the permission delegate in MainActivity.onCreate. Without the
// delegate, requestPermission() throws an uninitialized-lateinit exception in
// native code and hard-crashes the app (the library's README step that bare
// RN apps do by hand; prebuild regenerates MainActivity so it must be a mod).
const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins');

const DELEGATE_IMPORT = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const DELEGATE_CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

function withHealthConnectDelegate(config) {
  return withMainActivity(config, (config) => {
    let src = config.modResults.contents;
    if (config.modResults.language !== 'kt') {
      throw new Error('health-connect plugin expects a Kotlin MainActivity');
    }
    if (!src.includes(DELEGATE_IMPORT)) {
      src = src.replace(/^(package .*)$/m, `$1\n\n${DELEGATE_IMPORT}`);
    }
    if (!src.includes(DELEGATE_CALL)) {
      src = src.replace(/(super\.onCreate\([^)]*\))/, `$1\n    ${DELEGATE_CALL}`);
    }
    config.modResults.contents = src;
    return config;
  });
}

module.exports = function withHealthConnect(config) {
  config = withHealthConnectDelegate(config);
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    manifest.queries = manifest.queries || [];
    const hasHcQuery = manifest.queries.some(q =>
      (q.package || []).some(p => p.$?.['android:name'] === 'com.google.android.apps.healthdata'),
    );
    if (!hasHcQuery) {
      manifest.queries.push({
        package: [{ $: { 'android:name': 'com.google.android.apps.healthdata' } }],
      });
    }

    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(config.modResults);

    mainActivity['intent-filter'] = mainActivity['intent-filter'] || [];
    const hasRationale = mainActivity['intent-filter'].some(f =>
      (f.action || []).some(a => a.$?.['android:name'] === 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE'),
    );
    if (!hasRationale) {
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': 'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE' } }],
      });
    }

    app['activity-alias'] = app['activity-alias'] || [];
    const hasAlias = app['activity-alias'].some(a => a.$?.['android:name'] === 'ViewPermissionUsageActivity');
    if (!hasAlias) {
      app['activity-alias'].push({
        $: {
          'android:name': 'ViewPermissionUsageActivity',
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
          category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
        }],
      });
    }

    return config;
  });
};
