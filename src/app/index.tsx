// The camera IS the home screen. Open the app, point, shoot, put the phone
// away. Everything else happens in the background.
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, router, useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { C, F, radius } from '@/constants/theme';
import { CameraTour } from '@/components/camera-tour';
import { budgetForDay, syncActivity } from '@/lib/activity';
import { analyzeEntry, retryPending } from '@/lib/analyzer';
import { consumedForDay, dayKeyFor, getEntriesForDay, getMeta, insertEntry, setMeta, type Entry } from '@/lib/db';
import { t } from '@/lib/i18n';
import { fmtKcal, mealTypeForNow } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

const PHOTOS_DIR = FileSystem.documentDirectory + 'photos/';

async function persistPhoto(tempUri: string, copy = false): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(() => {});
  const dest = `${PHOTOS_DIR}${Date.now()}.jpg`;
  if (copy) await FileSystem.copyAsync({ from: tempUri, to: dest });
  else await FileSystem.moveAsync({ from: tempUri, to: dest });
  return dest;
}

export default function CameraScreen() {
  const { profile, refresh, version } = useStore();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const insets = useSafeAreaInsets();
  const [flash, setFlash] = useState<'off' | 'auto'>('auto');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shutterScale = useSharedValue(1);

  const [lastEntry, setLastEntry] = useState<Entry | null>(null);
  const [remaining, setRemaining] = useState(0);
  const [showTour, setShowTour] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const day = dayKeyFor(new Date());
      const { budget } = budgetForDay(profile, day);
      setRemaining(budget - consumedForDay(day));
      setLastEntry(getEntriesForDay(day)[0] ?? null);
      if (profile.onboardedAt && getMeta('camera_tour_done') !== '1') setShowTour(true);
      retryPending();
      // Pull fresh workout data (throttled); refresh only when something landed.
      void syncActivity().then(did => { if (did) refresh(); }).catch(() => {});
    }, [profile, version, refresh]),
  );

  const shutterStyle = useAnimatedStyle(() => ({ transform: [{ scale: shutterScale.value }] }));

  if (!profile.onboardedAt) return <Redirect href="/onboarding" />;

  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.permissionBox]}>
        <Text style={styles.permissionEmoji}>📷</Text>
        <Text style={styles.permissionTitle}>{t('cam.permTitle')}</Text>
        <Text style={styles.permissionText}>{t('cam.permText')}</Text>
        <Pressable style={styles.permissionBtn} onPress={requestPermission}>
          <Text style={styles.permissionBtnText}>{t('cam.permBtn')}</Text>
        </Pressable>
      </View>
    );
  }

  const logPhoto = async (uri: string, copy = false) => {
    const stored = await persistPhoto(uri, copy);
    const id = insertEntry(stored, mealTypeForNow());
    void analyzeEntry(id).then(() => refresh());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setToast(t('cam.logged'));
    setTimeout(() => setToast(null), 1800);
    refresh();
  };

  const onShutter = async () => {
    if (busy || !cameraRef.current) return;
    setBusy(true);
    shutterScale.value = withSequence(
      withTiming(0.85, { duration: 80, easing: Easing.out(Easing.quad) }),
      withTiming(1, { duration: 160 }),
    );
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (photo?.uri) await logPhoto(photo.uri);
    } catch {
      setToast(t('cam.photoFail'));
      setTimeout(() => setToast(null), 1800);
    } finally {
      setBusy(false);
    }
  };

  const onPickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
    if (!res.canceled && res.assets[0]?.uri) {
      await logPhoto(res.assets[0].uri, true);
      router.push('/today');
    }
  };

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} />

      {/* top bar */}
      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        <Pressable style={styles.pill} onPress={() => setFlash(f => (f === 'off' ? 'auto' : 'off'))}>
          <Text style={styles.pillText}>{flash === 'off' ? t('cam.flashOff') : t('cam.flashAuto')}</Text>
        </Pressable>
        <Pressable style={[styles.pill, remaining < 0 && { backgroundColor: 'rgba(194,86,75,0.85)' }]} onPress={() => router.push('/today')}>
          <Text style={styles.pillText}>
            {remaining >= 0 ? t('cam.kcalLeft', { kcal: fmtKcal(remaining) }) : t('cam.kcalOver', { kcal: fmtKcal(-remaining) })}
          </Text>
        </Pressable>
      </View>

      {/* logged toast */}
      {toast && (
        <Animated.View entering={FadeInDown.springify()} exiting={FadeOut} style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      {/* bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 18 }]}>
        <Pressable onPress={() => router.push('/today')} style={styles.lastEntry}>
          {lastEntry?.photoUri ? (
            <Image source={{ uri: lastEntry.photoUri }} style={styles.lastThumb} />
          ) : (
            <View style={[styles.lastThumb, { alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: 18 }}>🗒️</Text>
            </View>
          )}
          {lastEntry && lastEntry.status !== 'done' && <View style={styles.statusDot} />}
        </Pressable>

        <Animated.View style={shutterStyle}>
          <Pressable onPress={onShutter} style={styles.shutter} disabled={busy}>
            <View style={styles.shutterInner} />
          </Pressable>
        </Animated.View>

        <Pressable onPress={onPickFromGallery} style={styles.galleryBtn}>
          <Text style={{ fontSize: 22 }}>🖼️</Text>
        </Pressable>
      </View>

      {/* hint */}
      <Animated.View entering={FadeIn.delay(600)} style={[styles.hint, { bottom: insets.bottom + 130 }]}>
        <Text style={styles.hintText}>{t('cam.hint')}</Text>
      </Animated.View>

      {showTour && (
        <CameraTour onDone={() => { setMeta('camera_tour_done', '1'); setShowTour(false); }} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#141210' },
  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 5,
    flexDirection: 'row', justifyContent: 'space-between',
  },
  pill: {
    backgroundColor: 'rgba(28,24,19,0.55)',
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill,
  },
  pillText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingTop: 18,
  },
  shutter: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: '#fff',
    borderWidth: 3, borderColor: C.amber,
  },
  lastEntry: { width: 52, height: 52 },
  lastThumb: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  statusDot: {
    position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7,
    backgroundColor: C.amber, borderWidth: 2, borderColor: '#fff',
  },
  galleryBtn: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
  },
  toast: {
    position: 'absolute', top: '42%', alignSelf: 'center',
    backgroundColor: 'rgba(28,24,19,0.8)', borderRadius: radius.pill,
    paddingVertical: 12, paddingHorizontal: 22, zIndex: 10,
  },
  toastText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { position: 'absolute', alignSelf: 'center' },
  hintText: { color: 'rgba(255,255,255,0.55)', fontSize: 12 },
  permissionBox: { alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: C.bg },
  permissionEmoji: { fontSize: 56, marginBottom: 16 },
  permissionTitle: { fontFamily: F.heading, fontSize: 24, color: C.ink, marginBottom: 8 },
  permissionText: { fontSize: 15, color: C.muted, textAlign: 'center', marginBottom: 24, lineHeight: 22 },
  permissionBtn: { backgroundColor: C.amber, borderRadius: radius.button, paddingVertical: 14, paddingHorizontal: 28 },
  permissionBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
