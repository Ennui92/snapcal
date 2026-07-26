// Adding food without the camera: say it, pick an old photo from the
// gallery, or type it in. The camera is still the fastest path for a fresh
// plate, but none of those three cover a forgotten breakfast, a photo taken
// earlier and not yet logged, or hands too full to hold the phone up.
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { RecordingPresets, useAudioRecorder } from 'expo-audio';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { BigButton, Card, Chip, IconButton, ScreenHeader, Section } from '@/components/ui';
import { Icon } from '@/components/icons';
import { analyzeEntry } from '@/lib/analyzer';
import { insertEntry, insertManualEntry, setEntryTime } from '@/lib/db';
import { t } from '@/lib/i18n';
import { mealLabel, mealTypeForNow } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { ensureMicPermission, saveParsedMeal, transcribeAndParse, type ParsedMeal, type ParsedMealItem } from '@/lib/voice';
import { goBackOrHome } from '@/lib/nav';

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack', 'drink'] as const;
const DAY_OPTIONS = [
  { offset: 0, label: 'Today' },
  { offset: 1, label: 'Yesterday' },
  { offset: 2, label: '2 days ago' },
] as const;

const PHOTOS_DIR = FileSystem.documentDirectory + 'photos/';

// Same layout as index.tsx's persistPhoto — replicated here rather than
// imported, since add.tsx does not own index.tsx.
async function persistPhoto(tempUri: string): Promise<string> {
  await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true }).catch(() => {});
  const dest = `${PHOTOS_DIR}${Date.now()}.jpg`;
  await FileSystem.copyAsync({ from: tempUri, to: dest });
  return dest;
}

function fmtElapsed(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

type VoiceState = 'idle' | 'recording' | 'working' | 'confirm' | 'error';

export default function AddManualScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();

  const now = new Date();
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState('');
  const [grams, setGrams] = useState('');
  const [sugar, setSugar] = useState('');
  const [mealType, setMealType] = useState<string>(mealTypeForNow());
  const [dayOffset, setDayOffset] = useState<number>(0);
  const [time, setTime] = useState(
    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
  );

  // The moment an entry should count against. Day and time are picked
  // independently so an old photo dragged in from the gallery can land on
  // the right day even though it's being logged right now.
  const takenAt = (): Date => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    const m = time.trim().match(/^(\d{1,2})[:.](\d{2})$/);
    if (m && Number(m[1]) <= 23 && Number(m[2]) <= 59) {
      d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    }
    return d;
  };

  // --- manual name + calories (preserved from the original screen) ---
  const kcalNum = parseFloat(kcal.replace(',', '.'));
  const validManual = name.trim().length > 0 && isFinite(kcalNum) && kcalNum >= 0;

  const saveManual = () => {
    if (!validManual) return;
    const gramsNum = parseFloat(grams.replace(',', '.'));
    const sugarNum = parseFloat(sugar.replace(',', '.'));
    insertManualEntry({
      name: name.trim(),
      kcal: kcalNum,
      grams: isFinite(gramsNum) && gramsNum > 0 ? gramsNum : undefined,
      sugarG: isFinite(sugarNum) && sugarNum >= 0 ? sugarNum : undefined,
      mealType,
      takenAt: takenAt(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
    goBackOrHome();
  };

  // --- from gallery ---
  const [galleryBusy, setGalleryBusy] = useState(false);

  const onPickFromGallery = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.9 });
      if (res.canceled || !res.assets[0]?.uri) return;
      setGalleryBusy(true);
      const stored = await persistPhoto(res.assets[0].uri);
      const id = insertEntry(stored, mealType);
      setEntryTime(id, takenAt());
      void analyzeEntry(id).then(() => refresh());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh();
      goBackOrHome();
    } catch {
      Alert.alert('Could not add photo', 'Something went wrong reading that photo. Try again.');
    } finally {
      setGalleryBusy(false);
    }
  };

  // --- speak it ---
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [voiceError, setVoiceError] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [parsed, setParsed] = useState<ParsedMeal | null>(null);
  const [items, setItems] = useState<ParsedMealItem[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pulse = useSharedValue(1);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => {
    if (voiceState === 'recording') {
      pulse.value = withRepeat(withSequence(withTiming(1.5, { duration: 650 }), withTiming(1, { duration: 650 })), -1, true);
    } else {
      pulse.value = withTiming(1, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  const startRecording = async () => {
    const granted = await ensureMicPermission();
    if (!granted) {
      Alert.alert('Microphone access needed', 'Enable microphone access for SnapCal in Settings to log meals by voice.');
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setVoiceState('recording');
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    } catch {
      setVoiceError('Could not start recording.');
      setVoiceState('error');
    }
  };

  const stopRecording = async () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    setVoiceState('working');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error('no recording produced');
      const result = await transcribeAndParse(uri);
      setParsed(result);
      setItems(result.items);
      if (result.mealType) setMealType(result.mealType);
      setVoiceState('confirm');
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Could not make sense of that recording.');
      setVoiceState('error');
    }
  };

  const retryVoice = () => {
    setParsed(null);
    setItems([]);
    setVoiceError('');
    setVoiceState('idle');
  };

  const deleteVoiceItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));
  const editVoiceItemKcal = (idx: number, text: string) => {
    const v = parseFloat(text.replace(',', '.'));
    setItems(prev => prev.map((it, i) => (i === idx ? { ...it, kcal: isFinite(v) ? v : 0 } : it)));
  };

  const logVoiceMeal = () => {
    if (!parsed || items.length === 0) return;
    saveParsedMeal({ ...parsed, items }, takenAt(), mealType);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    refresh();
    goBackOrHome();
  };

  const busy = galleryBusy || voiceState === 'recording' || voiceState === 'working';

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      <ScreenHeader
        title={t('add.title')}
        left={<IconButton icon="back" onPress={() => goBackOrHome()} />}
      />

      <Text style={styles.lead}>{t('add.lead')}</Text>

      <View style={styles.topRow}>
        <BigButton
          label="Speak it"
          icon="bell"
          onPress={startRecording}
          disabled={busy}
          style={{ flex: 1 }}
        />
        <BigButton
          label="From gallery"
          icon="gallery"
          kind="ghost"
          onPress={onPickFromGallery}
          disabled={busy}
          style={{ flex: 1 }}
        />
      </View>

      {voiceState === 'recording' && (
        <Card style={styles.voiceCard}>
          <View style={styles.recordingRow}>
            <Animated.View style={[styles.pulseDot, pulseStyle]} />
            <Text style={styles.recordingTimer}>{fmtElapsed(elapsed)}</Text>
          </View>
          <Text style={styles.recordingHint}>Listening — say what you ate.</Text>
          <BigButton label="Stop" icon="check" onPress={stopRecording} style={{ marginTop: 14 }} />
        </Card>
      )}

      {voiceState === 'working' && (
        <Card style={styles.voiceCard}>
          <Text style={styles.workingText}>Working it out...</Text>
        </Card>
      )}

      {voiceState === 'error' && (
        <Card style={styles.voiceCard}>
          <View style={styles.errorRow}>
            <Icon name="warn" size={18} color={C.danger} weight={1.8} />
            <Text style={styles.errorText}>{voiceError || 'Something went wrong.'}</Text>
          </View>
          <BigButton label="Try again" icon="refresh" kind="ghost" onPress={retryVoice} style={{ marginTop: 14 }} />
        </Card>
      )}

      {voiceState === 'confirm' && parsed && (
        <Section title="You said">
          <Card style={{ marginBottom: 10 }}>
            <Text style={styles.transcript}>&ldquo;{parsed.transcript}&rdquo;</Text>
          </Card>
          {items.map((it, idx) => (
            <Card key={idx} style={styles.itemRow}>
              <Text style={styles.itemName} numberOfLines={1}>{it.name}</Text>
              <TextInput
                value={String(Math.round(it.kcal))}
                onChangeText={(v) => editVoiceItemKcal(idx, v)}
                keyboardType="decimal-pad"
                style={styles.itemKcalInput}
              />
              <Text style={styles.itemUnit}>kcal</Text>
              <Pressable onPress={() => deleteVoiceItem(idx)} hitSlop={10} style={{ marginLeft: 8 }}>
                <Icon name="trash" size={18} color={C.faint} />
              </Pressable>
            </Card>
          ))}
          {items.length === 0 && (
            <Text style={styles.emptyItemsText}>Every item was removed — nothing to log.</Text>
          )}
          <BigButton label="Log it" icon="check" onPress={logVoiceMeal} disabled={items.length === 0} style={{ marginTop: 4 }} />
        </Section>
      )}

      <Section title={t('add.what')}>
        <Card>
          <TextInput
            placeholder={t('add.namePlaceholder')}
            placeholderTextColor={C.faint}
            value={name}
            onChangeText={setName}
            style={styles.input}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('add.kcal')}</Text>
              <TextInput
                placeholder="250"
                placeholderTextColor={C.faint}
                keyboardType="decimal-pad"
                value={kcal}
                onChangeText={setKcal}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('add.grams')}</Text>
              <TextInput
                placeholder="—"
                placeholderTextColor={C.faint}
                keyboardType="decimal-pad"
                value={grams}
                onChangeText={setGrams}
                style={styles.input}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>{t('add.sugar')}</Text>
              <TextInput
                placeholder="—"
                placeholderTextColor={C.faint}
                keyboardType="decimal-pad"
                value={sugar}
                onChangeText={setSugar}
                style={styles.input}
              />
            </View>
          </View>
          <BigButton label={t('add.save')} onPress={saveManual} disabled={!validManual} style={{ marginTop: 4 }} />
        </Card>
      </Section>

      <Section title={t('add.when')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {MEALS.map(m => (
            <Chip
              key={m}
              label={mealLabel(m)}
              selected={mealType === m}
              onPress={() => setMealType(m)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
          {DAY_OPTIONS.map(d => (
            <Chip
              key={d.offset}
              label={d.label}
              selected={dayOffset === d.offset}
              onPress={() => setDayOffset(d.offset)}
            />
          ))}
        </View>
        <Card style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 15, color: C.ink }}>{t('add.time')}</Text>
          <TextInput
            value={time}
            onChangeText={setTime}
            keyboardType="numbers-and-punctuation"
            maxLength={5}
            style={[styles.input, { marginBottom: 0, minWidth: 84, textAlign: 'center' }]}
          />
        </Card>
        <Text style={styles.whenHint}>Applies to whichever way you log below — voice, gallery, or manual.</Text>
      </Section>
    </ScrollView>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  lead: { fontSize: 14, color: C.muted, lineHeight: 20, marginBottom: 16 },
  topRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  fieldLabel: { fontSize: 12, color: C.muted, marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, color: C.ink, marginBottom: 10, backgroundColor: C.bg,
  },
  voiceCard: { marginBottom: 16, alignItems: 'center' },
  recordingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pulseDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: C.danger },
  recordingTimer: { fontFamily: F.mono, fontSize: 26, color: C.ink, letterSpacing: -0.5 },
  recordingHint: { fontSize: 13, color: C.muted, marginTop: 10 },
  workingText: { fontSize: 15, color: C.ink },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorText: { fontSize: 14, color: C.danger, flexShrink: 1 },
  transcript: { fontSize: 14, color: C.ink, fontStyle: 'italic', lineHeight: 20 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginBottom: 8,
  },
  itemName: { flex: 1, fontSize: 14, color: C.ink, marginRight: 8 },
  itemKcalInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10,
    fontSize: 14, color: C.ink, minWidth: 56, textAlign: 'center', backgroundColor: C.bg,
  },
  itemUnit: { fontSize: 11, color: C.faint, marginLeft: 6 },
  emptyItemsText: { fontSize: 13, color: C.muted, marginBottom: 10 },
  whenHint: { fontSize: 12, color: C.faint, marginTop: 10, lineHeight: 16 },
});
