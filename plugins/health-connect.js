// Expo config plugin for react-native-health-connect: adds the manifest
// pieces Health Connect requires beyond raw permissions —
//  - a <queries> entry so the app can see the Health Connect package (Android 13-)
//  - the permissions-rationale intent filter on MainActivity (Android 13-)
//  - the ViewPermissionUsageActivity alias (Android 14+)
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

module.exports = function withHealthConnect(config) {
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
