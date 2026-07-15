// Settings: everything from onboarding, editable. Plus weight logging,
// nudge strictness, hand calibration and a full data export.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/constants/theme';
import { BigButton, Card, Chip, Section } from '@/components/ui';
import { exportAllData, logWeight, saveProfile, type Profile } from '@/lib/db';
import { ACTIVITY_LABELS, bmi, bmiCategory, dailyBudget, fmtKcal } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refresh } = useStore();
  const [p, setP] = useState<Profile>(profile);
  const [weightInput, setWeightInput] = useState('');

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setP(prev => ({ ...prev, [k]: v }));

  const recalc = (next: Profile): Profile => ({
    ...next,
    dailyBudgetKcal: dailyBudget(next),
  });

  const save = () => {
    const next = recalc(p);
    saveProfile(next);
    refresh();
    router.back();
  };

  const onLogWeight = () => {
    const w = parseFloat(weightInput.replace(',', '.'));
    if (!isFinite(w) || w < 25 || w > 350) return;
    logWeight(w);
    const next = recalc({ ...p, weightKg: w });
    saveProfile(next);
    setP(next);
    setWeightInput('');
    refresh();
    Alert.alert('Weight logged', `Budget recalculated: ${fmtKcal(next.dailyBudgetKcal)} kcal/day.`);
  };

  const onExport = async () => {
    await Share.share({ message: exportAllData() });
  };

  const preview = recalc(p);
  const b = bmi(p.heightCm, p.weightKg);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}><Text style={{ fontSize: 16 }}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 42 }} />
      </View>

      <Section title="Your numbers">
        <Card>
          <Row label="Height (cm)">
            <NumInput value={String(p.heightCm)} onChange={v => set('heightCm', clampNum(v, 100, 250, p.heightCm))} />
          </Row>
          <Row label="Weight (kg)">
            <NumInput value={String(p.weightKg)} onChange={v => set('weightKg', clampNum(v, 25, 350, p.weightKg))} />
          </Row>
          <Row label="Birth year">
            <NumInput value={String(p.birthYear)} onChange={v => set('birthYear', clampNum(v, 1920, 2020, p.birthYear))} />
          </Row>
          <Row label="Sex">
            <View style={{ flexDirection: 'row' }}>
              <Chip label="Male" selected={p.sex === 'male'} onPress={() => set('sex', 'male')} />
              <Chip label="Female" selected={p.sex === 'female'} onPress={() => set('sex', 'female')} />
            </View>
          </Row>
          <Text style={styles.bmiNote}>BMI {b} ({bmiCategory(b)})</Text>
        </Card>
      </Section>

      <Section title="Activity">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {(Object.keys(ACTIVITY_LABELS) as Profile['activity'][]).map(a => (
            <Chip key={a} label={ACTIVITY_LABELS[a]} selected={p.activity === a} onPress={() => set('activity', a)} />
          ))}
        </View>
      </Section>

      <Section title="Goal">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Lose weight" selected={p.goal === 'lose'} onPress={() => set('goal', 'lose')} />
          <Chip label="Maintain" selected={p.goal === 'maintain'} onPress={() => set('goal', 'maintain')} />
          <Chip label="Gain" selected={p.goal === 'gain'} onPress={() => set('goal', 'gain')} />
        </View>
        {p.goal !== 'maintain' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {[0.25, 0.5, 0.75, 1].map(pace => (
              <Chip key={pace} label={`${pace} kg/week`} selected={p.paceKgPerWeek === pace} onPress={() => set('paceKgPerWeek', pace)} />
            ))}
          </View>
        )}
        <Card style={{ marginTop: 10 }}>
          <Text style={styles.budgetPreview}>Daily budget: {fmtKcal(preview.dailyBudgetKcal)} kcal</Text>
          <Text style={styles.budgetSub}>
            {p.goal === 'lose'
              ? 'Staying under this line is what makes the scale move down.'
              : p.goal === 'gain'
                ? 'Staying above this line supports your gain goal.'
                : 'This keeps you where you are.'}
          </Text>
        </Card>
      </Section>

      <Section title="Nudges">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label="Off" selected={p.strictness === 'off'} onPress={() => set('strictness', 'off')} />
          <Chip label="Gentle" selected={p.strictness === 'gentle'} onPress={() => set('strictness', 'gentle')} />
          <Chip label="Normal" selected={p.strictness === 'normal'} onPress={() => set('strictness', 'normal')} />
          <Chip label="Strict" selected={p.strictness === 'strict'} onPress={() => set('strictness', 'strict')} />
        </View>
        <Text style={styles.hintText}>
          If a day is running hot, SnapCal sends one friendly heads-up with a lighter idea for the next meal. Never more than one every few hours.
        </Text>
      </Section>

      <Section title="Hand calibration">
        <Card>
          <Text style={styles.hintText}>
            Include your hand in photos and the AI uses it as a ruler. Measure from where your palm starts to the tip of your middle finger.
          </Text>
          <Row label="Hand length (cm)">
            <NumInput value={String(p.handCm)} onChange={v => set('handCm', clampNum(v, 10, 30, p.handCm))} />
          </Row>
        </Card>
      </Section>

      <Section title="Log today's weight">
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            placeholder="e.g. 78.4"
            placeholderTextColor={C.faint}
            keyboardType="decimal-pad"
            value={weightInput}
            onChangeText={setWeightInput}
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
          />
          <BigButton label="Log" onPress={onLogWeight} style={{ paddingVertical: 12, paddingHorizontal: 20 }} />
        </Card>
      </Section>

      <Section title="Your data">
        <Text style={styles.hintText}>
          Everything lives on this phone. No account, no cloud database, no tracking. Photos are sent once for analysis and are not stored anywhere else.
        </Text>
        <BigButton label="Export everything (JSON)" kind="ghost" onPress={onExport} />
      </Section>

      <BigButton label="Save changes" onPress={save} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}

function clampNum(v: string, min: number, max: number, fallback: number): number {
  const n = parseFloat(v.replace(',', '.'));
  if (!isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  return (
    <TextInput
      value={local}
      onChangeText={setLocal}
      onEndEditing={() => onChange(local)}
      keyboardType="decimal-pad"
      style={styles.numInput}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  headerBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rowLabel: { fontSize: 15, color: C.ink },
  numInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14,
    fontSize: 16, color: C.ink, minWidth: 90, textAlign: 'center', backgroundColor: C.bg,
  },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, color: C.ink, backgroundColor: C.bg,
  },
  bmiNote: { fontSize: 13, color: C.muted, marginTop: 2 },
  budgetPreview: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  budgetSub: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 19 },
  hintText: { fontSize: 13, color: C.muted, lineHeight: 19, marginBottom: 10 },
});
