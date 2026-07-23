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
import { C, F, label, radius } from '@/constants/theme';
import { CameraTour } from '@/components/camera-tour';
import { Icon } from '@/components/icons';
import { BigButton } from '@/components/ui';
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

/** Viewfinder brackets. Costs nothing, and makes the screen read as a camera. */
function Reticle() {
  return (
    <View pointerEvents="none" style={styles.reticle}>
      <View style={[styles.corner, styles.tl]} />
      <View style={[styles.corner, styles.tr]} />
      <View style={[styles.corner, styles.bl]} />
      <View style={[styles.corner, styles.br]} />
    </View>
  );
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
  const [budget, setBudget] = useState(0);
  const [showTour, setShowTour] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const day = dayKeyFor(new Date());
      const { budget: b } = budgetForDay(profile, day);
      setBudget(b);
      setRemaining(b - consumedForDay(day));
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
        <View style={styles.permIcon}>
          <Icon name="camera" size={34} color={C.signal} weight={1.6} />
        </View>
        <Text style={styles.permissionTitle}>{t('cam.permTitle')}</Text>
        <Text style={styles.permissionText}>{t('cam.permText')}</Text>
        <BigButton label={t('cam.permBtn')} icon="camera" onPress={requestPermission} style={{ alignSelf: 'stretch' }} />
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
      withTiming(1, { duration: 220, easing: Easing.elastic(1.4) }),
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

  const over = remaining < 0;
  const usedFrac = budget > 0 ? Math.min(Math.max(1 - remaining / budget, 0), 1) : 0;

  return (
    <View style={styles.root}>
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} />
      <Reticle />

      {/* top bar: flash toggle + the only number that matters */}
      <View style={[styles.topBar, { top: insets.top + 10 }]}>
        <Pressable style={styles.flashBtn} onPress={() => setFlash(f => (f === 'off' ? 'auto' : 'off'))} hitSlop={8}>
          <Icon name={flash === 'off' ? 'boltOff' : 'bolt'} size={17} color={flash === 'off' ? C.muted : C.signal} />
          <Text style={[styles.flashText, { color: flash === 'off' ? C.muted : C.signal }]}>
            {flash === 'off' ? 'off' : 'auto'}
          </Text>
        </Pressable>

        <Pressable style={styles.budgetChip} onPress={() => router.push('/today')}>
          <View style={styles.budgetRow}>
            <Text style={[styles.budgetNum, over && { color: C.danger }]}>
              {fmtKcal(Math.abs(remaining))}
            </Text>
            <Text style={styles.budgetUnit}>{over ? t('ring.over') : t('ring.left')}</Text>
          </View>
          <View style={styles.budgetTrack}>
            <View
              style={[
                styles.budgetFill,
                { width: `${usedFrac * 100}%`, backgroundColor: over ? C.danger : C.signal },
              ]}
            />
          </View>
        </Pressable>
      </View>

      {/* logged confirmation */}
      {toast && (
        <Animated.View entering={FadeInDown.springify().damping(15)} exiting={FadeOut} style={styles.toast}>
          <Icon name="check" size={16} color={C.signal} weight={2.4} />
          <Text style={styles.toastText}>{toast}</Text>
        </Animated.View>
      )}

      {/* bottom controls */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 22 }]}>
        <Pressable onPress={() => router.push('/today')} style={styles.sideBtn}>
          {lastEntry?.photoUri ? (
            <Image source={{ uri: lastEntry.photoUri }} style={styles.sideThumb} />
          ) : (
            <Icon name="chart" size={20} color={C.ink} />
          )}
          {lastEntry && lastEntry.status !== 'done' && <View style={styles.statusDot} />}
        </Pressable>

        <Animated.View style={shutterStyle}>
          <Pressable onPress={onShutter} style={styles.shutter} disabled={busy}>
            <View style={styles.shutterRing} />
            <View style={[styles.shutterInner, busy && { opacity: 0.5 }]} />
          </Pressable>
        </Animated.View>

        <Pressable onPress={onPickFromGallery} style={styles.sideBtn}>
          <Icon name="gallery" size={20} color={C.ink} />
        </Pressable>
      </View>

      {/* hint */}
      <Animated.View entering={FadeIn.delay(600)} style={[styles.hint, { bottom: insets.bottom + 132 }]}>
        <Text style={styles.hintText}>{t('cam.hint')}</Text>
      </Animated.View>

      {showTour && (
        <CameraTour onDone={() => { setMeta('camera_tour_done', '1'); setShowTour(false); }} />
      )}
    </View>
  );
}

const BRACKET = 26;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  reticle: { position: 'absolute', top: '22%', bottom: '26%', left: 34, right: 34 },
  corner: { position: 'absolute', width: BRACKET, height: BRACKET, borderColor: 'rgba(255,255,255,0.5)' },
  tl: { top: 0, left: 0, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
  tr: { top: 0, right: 0, borderTopWidth: 1.5, borderRightWidth: 1.5 },
  bl: { bottom: 0, left: 0, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
  br: { bottom: 0, right: 0, borderBottomWidth: 1.5, borderRightWidth: 1.5 },

  topBar: {
    position: 'absolute', left: 16, right: 16, zIndex: 5,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
  },
  flashBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.overlay, borderRadius: radius.button,
    paddingVertical: 9, paddingHorizontal: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  flashText: { ...label, fontSize: 9.5 },
  budgetChip: {
    backgroundColor: C.overlay, borderRadius: radius.button,
    paddingTop: 8, paddingBottom: 9, paddingHorizontal: 13, minWidth: 128,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)',
  },
  budgetRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  budgetNum: { fontFamily: F.mono, fontSize: 21, color: C.ink, letterSpacing: -0.8 },
  budgetUnit: { ...label, fontSize: 8.5, color: C.muted },
  budgetTrack: { height: 2.5, backgroundColor: 'rgba(255,255,255,0.15)', marginTop: 7, overflow: 'hidden' },
  budgetFill: { height: '100%' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    paddingTop: 18,
  },
  shutter: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' },
  shutterRing: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 43, borderWidth: 2, borderColor: 'rgba(255,255,255,0.85)',
  },
  shutterInner: {
    width: 66, height: 66, borderRadius: 33, backgroundColor: C.signal,
  },
  sideBtn: {
    width: 54, height: 54, borderRadius: radius.card,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    backgroundColor: C.overlay, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  sideThumb: { width: '100%', height: '100%' },
  statusDot: {
    position: 'absolute', top: 5, right: 5, width: 10, height: 10, borderRadius: 5,
    backgroundColor: C.signal, borderWidth: 1.5, borderColor: C.bg,
  },

  toast: {
    position: 'absolute', top: '44%', alignSelf: 'center', zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 9,
    backgroundColor: C.overlay, borderRadius: radius.button,
    paddingVertical: 13, paddingHorizontal: 20,
    borderWidth: 1, borderColor: 'rgba(200,250,60,0.35)',
  },
  toastText: { ...label, fontSize: 11, color: C.ink },

  hint: { position: 'absolute', alignSelf: 'center' },
  hintText: { ...label, fontSize: 9, color: 'rgba(255,255,255,0.45)' },

  permissionBox: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  permIcon: {
    width: 76, height: 76, borderRadius: radius.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 22, backgroundColor: C.card,
  },
  permissionTitle: { fontFamily: F.heading, fontSize: 25, color: C.ink, marginBottom: 10, letterSpacing: -0.5 },
  permissionText: { fontSize: 15, color: C.muted, textAlign: 'center', marginBottom: 28, lineHeight: 22 },
});
