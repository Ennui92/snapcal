// One-time setup. Four steps, then the user never has to touch a form again:
// value prop, body stats (with live BMI), goal (with the budget reveal),
// hand calibration + nudges.
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AVERAGE_HAND_CM } from '@/lib/config';
import { C, F, radius } from '@/constants/theme';
import { BigButton, Card, Chip } from '@/components/ui';
import { saveProfile, type Profile } from '@/lib/db';
import { ACTIVITY_LABELS, bmi, bmiCategory, dailyBudget, fmtKcal, tdee } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

type Draft = Omit<Profile, 'id' | 'dailyBudgetKcal' | 'onboardedAt'>;

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { refresh } = useStore();
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({
    sex: 'male', birthYear: 1992, heightCm: 178, weightKg: 80,
    activity: 'light', goal: 'lose', paceKgPerWeek: 0.5,
    strictness: 'normal', handCm: AVERAGE_HAND_CM,
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD(prev => ({ ...prev, [k]: v }));
  const next = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setStep(s => s + 1); };

  const finish = async () => {
    const budget = dailyBudget(d);
    saveProfile({ ...d, dailyBudgetKcal: budget, onboardedAt: new Date().toISOString() });
    if (d.strictness !== 'off') {
      await Notifications.requestPermissionsAsync().catch(() => {});
    }
    refresh();
    router.replace('/');
  };

  const b = bmi(d.heightCm, d.weightKg);
  const budget = dailyBudget(d);
  const maintenance = tdee(d);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30, paddingHorizontal: 24, flexGrow: 1 }}
    >
      {/* progress dots */}
      <View style={styles.dots}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      {step === 0 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.hero}>📸</Text>
          <Text style={styles.title}>Point. Shoot.{'\n'}<Text style={styles.titleAccent}>Eat.</Text></Text>
          <Text style={styles.lead}>
            SnapCal counts your calories from a single photo. No barcode scanning, no searching databases, no typing grams into little boxes.
          </Text>
          <Card style={{ marginTop: 20 }}>
            <Bullet text="Open the app, the camera is already there" />
            <Bullet text="One tap logs the meal, then go eat it" />
            <Bullet text="The AI fills in calories in the background" />
            <Bullet text="Your food diary stays on your phone. It is yours, we never see it" />
          </Card>
          <View style={{ flex: 1 }} />
          <BigButton label="Set me up" onPress={next} />
        </Animated.View>
      )}

      {step === 1 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>About you</Text>
          <Text style={styles.lead}>This is only used to work out your daily calorie budget. It never leaves the phone.</Text>

          <Card style={{ marginTop: 18 }}>
            <FieldRow label="Sex">
              <View style={{ flexDirection: 'row' }}>
                <Chip label="Male" selected={d.sex === 'male'} onPress={() => set('sex', 'male')} />
                <Chip label="Female" selected={d.sex === 'female'} onPress={() => set('sex', 'female')} />
              </View>
            </FieldRow>
            <FieldRow label="Birth year"><Num value={d.birthYear} onChange={v => set('birthYear', v)} min={1920} max={2020} /></FieldRow>
            <FieldRow label="Height (cm)"><Num value={d.heightCm} onChange={v => set('heightCm', v)} min={100} max={250} /></FieldRow>
            <FieldRow label="Weight (kg)"><Num value={d.weightKg} onChange={v => set('weightKg', v)} min={25} max={350} /></FieldRow>
          </Card>

          <Card style={{ marginTop: 12, backgroundColor: C.amberSoft, borderColor: C.amber }}>
            <Text style={styles.bmiBig}>BMI {b}</Text>
            <Text style={styles.bmiSub}>{bmiCategory(b)}</Text>
          </Card>

          <Text style={[styles.lead, { marginTop: 18, marginBottom: 8 }]}>How active are you, honestly?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {(Object.keys(ACTIVITY_LABELS) as Draft['activity'][]).map(a => (
              <Chip key={a} label={ACTIVITY_LABELS[a]} selected={d.activity === a} onPress={() => set('activity', a)} />
            ))}
          </View>

          <View style={{ flex: 1 }} />
          <BigButton label="Continue" onPress={next} style={{ marginTop: 20 }} />
        </Animated.View>
      )}

      {step === 2 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>Your goal</Text>
          <Text style={styles.lead}>
            Losing weight means eating under what your body burns. SnapCal keeps the score so you always know which side of the line today is on.
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 }}>
            <Chip label="Lose weight" selected={d.goal === 'lose'} onPress={() => set('goal', 'lose')} />
            <Chip label="Maintain" selected={d.goal === 'maintain'} onPress={() => set('goal', 'maintain')} />
            <Chip label="Gain" selected={d.goal === 'gain'} onPress={() => set('goal', 'gain')} />
          </View>
          {d.goal !== 'maintain' && (
            <>
              <Text style={[styles.lead, { marginTop: 12, marginBottom: 6 }]}>How fast?</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {[0.25, 0.5, 0.75, 1].map(pace => (
                  <Chip key={pace} label={`${pace} kg/week`} selected={d.paceKgPerWeek === pace} onPress={() => set('paceKgPerWeek', pace)} />
                ))}
              </View>
            </>
          )}

          <Animated.View entering={FadeInDown.springify()} key={budget} style={{ marginTop: 22 }}>
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={styles.budgetLabel}>Your daily budget</Text>
              <Text style={styles.budgetBig}>{fmtKcal(budget)} kcal</Text>
              <Text style={styles.budgetSub}>
                Your body burns about {fmtKcal(maintenance)} kcal a day.{' '}
                {d.goal === 'lose'
                  ? `Eating ${fmtKcal(maintenance - budget)} under that is what makes weight come off.`
                  : d.goal === 'gain'
                    ? 'Eating above that is what builds mass.'
                    : 'Matching it keeps you steady.'}
              </Text>
            </Card>
          </Animated.View>

          <View style={{ flex: 1 }} />
          <BigButton label="Continue" onPress={next} style={{ marginTop: 20 }} />
        </Animated.View>
      )}

      {step === 3 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>Two last tricks</Text>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>🖐️ Your hand is the ruler</Text>
            <Text style={styles.cardText}>
              Put your hand next to the plate in photos and the AI uses it to judge portion sizes. Measure from where your palm starts to the tip of your middle finger.
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
              <Num value={d.handCm} onChange={v => set('handCm', v)} min={10} max={30} decimal />
              <Text style={{ color: C.muted }}>cm</Text>
              <Pressable onPress={() => set('handCm', AVERAGE_HAND_CM)}>
                <Text style={{ color: C.amber, fontWeight: '600' }}>use average ({AVERAGE_HAND_CM})</Text>
              </Pressable>
            </View>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={styles.cardTitle}>💬 Gentle nudges</Text>
            <Text style={styles.cardText}>
              If a day is running hot, SnapCal can send one friendly heads-up with a lighter idea for your next meal. How firm should it be?
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
              <Chip label="Off" selected={d.strictness === 'off'} onPress={() => set('strictness', 'off')} />
              <Chip label="Gentle" selected={d.strictness === 'gentle'} onPress={() => set('strictness', 'gentle')} />
              <Chip label="Normal" selected={d.strictness === 'normal'} onPress={() => set('strictness', 'normal')} />
              <Chip label="Strict" selected={d.strictness === 'strict'} onPress={() => set('strictness', 'strict')} />
            </View>
          </Card>

          <View style={{ flex: 1 }} />
          <BigButton label="Open the camera 📸" onPress={finish} style={{ marginTop: 20 }} />
        </Animated.View>
      )}
    </ScrollView>
  );
}

function Bullet({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', marginBottom: 10 }}>
      <Text style={{ color: C.amber, marginRight: 10, fontSize: 15 }}>●</Text>
      <Text style={{ color: C.ink, fontSize: 15, flex: 1, lineHeight: 21 }}>{text}</Text>
    </View>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Num({ value, onChange, min, max, decimal }: { value: number; onChange: (v: number) => void; min: number; max: number; decimal?: boolean }) {
  const [local, setLocal] = useState(String(value));
  return (
    <TextInput
      value={local}
      onChangeText={setLocal}
      onEndEditing={() => {
        const n = parseFloat(local.replace(',', '.'));
        if (isFinite(n)) onChange(Math.min(max, Math.max(min, decimal ? n : Math.round(n))));
        else setLocal(String(value));
      }}
      keyboardType="decimal-pad"
      style={styles.numInput}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 24 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.amber, width: 22 },
  stepBox: { flex: 1 },
  hero: { fontSize: 64, textAlign: 'center', marginBottom: 12 },
  title: { fontFamily: F.heading, fontSize: 34, color: C.ink, lineHeight: 40 },
  titleAccent: { fontFamily: F.headingItalic, color: C.amber },
  lead: { fontSize: 15, color: C.muted, marginTop: 10, lineHeight: 22 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  fieldLabel: { fontSize: 15, color: C.ink },
  numInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14,
    fontSize: 16, color: C.ink, minWidth: 90, textAlign: 'center', backgroundColor: C.bg,
  },
  bmiBig: { fontFamily: F.heading, fontSize: 24, color: C.amber },
  bmiSub: { color: C.muted, marginTop: 2 },
  budgetLabel: { fontSize: 13, color: C.muted, textTransform: 'uppercase', letterSpacing: 1 },
  budgetBig: { fontFamily: F.heading, fontSize: 42, color: C.ink, marginVertical: 6 },
  budgetSub: { fontSize: 13, color: C.muted, textAlign: 'center', lineHeight: 19, paddingHorizontal: 10 },
  cardTitle: { fontFamily: F.heading, fontSize: 17, color: C.ink, marginBottom: 6 },
  cardText: { fontSize: 14, color: C.muted, lineHeight: 20 },
  radius: { borderRadius: radius.card },
});
