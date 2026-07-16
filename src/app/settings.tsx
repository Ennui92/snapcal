// Settings: everything from onboarding, editable. Plus language, fitness
// connections, weight logging, nudge strictness, hand calibration and a
// full data export.
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from '@/constants/theme';
import { BigButton, Card, Chip, Section } from '@/components/ui';
import { anyProviderConnected, connectedProviderNames } from '@/lib/activity';
import { exportAllData, logWeight, saveProfile, setMeta, type Profile } from '@/lib/db';
import { getLanguage, LANGS, setLanguage, t } from '@/lib/i18n';
import { ACTIVITY_KEYS, activityLabel, bmi, bmiCategory, dailyBudget, fmtKcal } from '@/lib/nutrition';
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
    Alert.alert(t('set.weightLogged'), t('set.weightLoggedBody', { kcal: fmtKcal(next.dailyBudgetKcal) }));
  };

  const onExport = async () => {
    await Share.share({ message: exportAllData() });
  };

  const replayTour = () => {
    setMeta('camera_tour_done', '');
    refresh();
    router.replace('/');
  };

  const preview = recalc(p);
  const b = bmi(p.heightCm, p.weightKg);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 40, paddingHorizontal: 16 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}><Text style={{ fontSize: 16 }}>‹</Text></Pressable>
        <Text style={styles.headerTitle}>{t('set.title')}</Text>
        <View style={{ width: 42 }} />
      </View>

      <Section title={t('set.language')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {LANGS.map(l => (
            <Chip
              key={l.code}
              label={l.label}
              selected={getLanguage() === l.code}
              onPress={() => { setLanguage(l.code); refresh(); }}
            />
          ))}
        </View>
        <Text style={styles.hintText}>{t('set.aiLangNote')}</Text>
      </Section>

      <Section title={t('set.yourNumbers')}>
        <Card>
          <Row label={t('onb.height')}>
            <NumInput value={String(p.heightCm)} onChange={v => set('heightCm', clampNum(v, 100, 250, p.heightCm))} />
          </Row>
          <Row label={t('onb.weight')}>
            <NumInput value={String(p.weightKg)} onChange={v => set('weightKg', clampNum(v, 25, 350, p.weightKg))} />
          </Row>
          <Row label={t('onb.birthYear')}>
            <NumInput value={String(p.birthYear)} onChange={v => set('birthYear', clampNum(v, 1920, 2020, p.birthYear))} />
          </Row>
          <Row label={t('onb.sex')}>
            <View style={{ flexDirection: 'row' }}>
              <Chip label={t('onb.male')} selected={p.sex === 'male'} onPress={() => set('sex', 'male')} />
              <Chip label={t('onb.female')} selected={p.sex === 'female'} onPress={() => set('sex', 'female')} />
            </View>
          </Row>
          <Text style={styles.bmiNote}>BMI {b} ({bmiCategory(b)})</Text>
        </Card>
      </Section>

      <Section title={t('set.activity')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {ACTIVITY_KEYS.map(a => (
            <Chip key={a} label={activityLabel(a)} selected={p.activity === a} onPress={() => set('activity', a)} />
          ))}
        </View>
      </Section>

      <Section title={t('set.fitness')}>
        <Card>
          <Text style={styles.hintText}>
            {anyProviderConnected()
              ? t('set.fitnessConnected', { names: connectedProviderNames().join(' + ') })
              : t('set.fitnessNotConnected')}
          </Text>
          <BigButton label={t('set.manageConnections')} kind="ghost" onPress={() => router.push('/connections')} />
        </Card>
      </Section>

      <Section title={t('set.goal')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={t('goal.lose')} selected={p.goal === 'lose'} onPress={() => set('goal', 'lose')} />
          <Chip label={t('goal.maintain')} selected={p.goal === 'maintain'} onPress={() => set('goal', 'maintain')} />
          <Chip label={t('goal.gain')} selected={p.goal === 'gain'} onPress={() => set('goal', 'gain')} />
        </View>
        {p.goal !== 'maintain' && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 }}>
            {[0.25, 0.5, 0.75, 1].map(pace => (
              <Chip key={pace} label={t('onb.pace', { pace })} selected={p.paceKgPerWeek === pace} onPress={() => set('paceKgPerWeek', pace)} />
            ))}
          </View>
        )}
        <Card style={{ marginTop: 10 }}>
          <Text style={styles.budgetPreview}>{t('set.dailyBudget', { kcal: fmtKcal(preview.dailyBudgetKcal) })}</Text>
          <Text style={styles.budgetSub}>
            {p.goal === 'lose'
              ? t('set.goalLoseNote')
              : p.goal === 'gain'
                ? t('set.goalGainNote')
                : t('set.goalMaintainNote')}
          </Text>
        </Card>
      </Section>

      <Section title={t('set.nudges')}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <Chip label={t('strict.off')} selected={p.strictness === 'off'} onPress={() => set('strictness', 'off')} />
          <Chip label={t('strict.gentle')} selected={p.strictness === 'gentle'} onPress={() => set('strictness', 'gentle')} />
          <Chip label={t('strict.normal')} selected={p.strictness === 'normal'} onPress={() => set('strictness', 'normal')} />
          <Chip label={t('strict.strict')} selected={p.strictness === 'strict'} onPress={() => set('strictness', 'strict')} />
        </View>
        <Text style={styles.hintText}>{t('set.nudgeNote')}</Text>
      </Section>

      <Section title={t('set.hand')}>
        <Card>
          <Text style={styles.hintText}>{t('onb.handText')}</Text>
          <Row label={t('set.handLen')}>
            <NumInput value={String(p.handCm)} onChange={v => set('handCm', clampNum(v, 10, 30, p.handCm))} />
          </Row>
        </Card>
      </Section>

      <Section title={t('set.logWeight')}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            placeholder={t('set.weightPlaceholder')}
            placeholderTextColor={C.faint}
            keyboardType="decimal-pad"
            value={weightInput}
            onChangeText={setWeightInput}
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
          />
          <BigButton label={t('set.log')} onPress={onLogWeight} style={{ paddingVertical: 12, paddingHorizontal: 20 }} />
        </Card>
      </Section>

      <Section title={t('set.yourData')}>
        <Text style={styles.hintText}>{t('set.dataNote')}</Text>
        <BigButton label={t('set.export')} kind="ghost" onPress={onExport} />
        <BigButton label={t('set.replayTour')} kind="ghost" onPress={replayTour} style={{ marginTop: 10 }} />
      </Section>

      <BigButton label={t('set.save')} onPress={save} style={{ marginTop: 8 }} />
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
