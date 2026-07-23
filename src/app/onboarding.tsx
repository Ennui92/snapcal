// One-time setup. Five steps, then the user never has to touch a form again:
// value prop (+ language), a ten-second demo of the whole loop, body stats
// (with live BMI), goal (with the budget reveal), hand calibration + nudges.
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
import { DemoFlow } from '@/components/demo-flow';
import { saveProfile, type Profile } from '@/lib/db';
import { getLanguage, LANGS, setLanguage, t } from '@/lib/i18n';
import { ACTIVITY_KEYS, activityLabel, bmi, bmiCategory, dailyBudget, fmtKcal, tdee } from '@/lib/nutrition';
import { useStore } from '@/lib/store';
import { Icon } from '@/components/icons';

type Draft = Omit<Profile, 'id' | 'dailyBudgetKcal' | 'onboardedAt'>;

const STEPS = 5;

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
        {Array.from({ length: STEPS }, (_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>

      {step === 0 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <View style={styles.heroBox}><Icon name="camera" size={40} color={C.signal} weight={1.5} /></View>
          <Text style={styles.title}>{t('onb.heroTitle')}{'\n'}<Text style={styles.titleAccent}>{t('onb.heroAccent')}</Text></Text>
          <Text style={styles.lead}>{t('onb.lead')}</Text>
          <Card style={{ marginTop: 20 }}>
            <Bullet text={t('onb.bullet1')} />
            <Bullet text={t('onb.bullet2')} />
            <Bullet text={t('onb.bullet3')} />
            <Bullet text={t('onb.bullet4')} />
          </Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 }}>
            {LANGS.map(l => (
              <Chip
                key={l.code}
                label={l.label}
                selected={getLanguage() === l.code}
                onPress={() => { setLanguage(l.code); refresh(); }}
              />
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <BigButton label={t('onb.setMeUp')} onPress={next} style={{ marginTop: 20 }} />
        </Animated.View>
      )}

      {step === 1 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>{t('demo.title')}</Text>
          <Text style={styles.lead}>{t('demo.lead')}</Text>
          <View style={{ marginTop: 18 }}>
            <DemoFlow />
          </View>
          <View style={{ flex: 1 }} />
          <BigButton label={t('common.continue')} onPress={next} style={{ marginTop: 20 }} />
        </Animated.View>
      )}

      {step === 2 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>{t('onb.aboutTitle')}</Text>
          <Text style={styles.lead}>{t('onb.aboutLead')}</Text>

          <Card style={{ marginTop: 18 }}>
            <FieldRow label={t('onb.sex')}>
              <View style={{ flexDirection: 'row' }}>
                <Chip label={t('onb.male')} selected={d.sex === 'male'} onPress={() => set('sex', 'male')} />
                <Chip label={t('onb.female')} selected={d.sex === 'female'} onPress={() => set('sex', 'female')} />
              </View>
            </FieldRow>
            <FieldRow label={t('onb.birthYear')}><Num value={d.birthYear} onChange={v => set('birthYear', v)} min={1920} max={2020} /></FieldRow>
            <FieldRow label={t('onb.height')}><Num value={d.heightCm} onChange={v => set('heightCm', v)} min={100} max={250} /></FieldRow>
            <FieldRow label={t('onb.weight')}><Num value={d.weightKg} onChange={v => set('weightKg', v)} min={25} max={350} /></FieldRow>
          </Card>

          <Card style={{ marginTop: 12, backgroundColor: C.amberSoft, borderColor: C.amber }}>
            <Text style={styles.bmiBig}>BMI {b}</Text>
            <Text style={styles.bmiSub}>{bmiCategory(b)}</Text>
          </Card>

          <Text style={[styles.lead, { marginTop: 18, marginBottom: 8 }]}>{t('onb.activityQ')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {ACTIVITY_KEYS.map(a => (
              <Chip key={a} label={activityLabel(a)} selected={d.activity === a} onPress={() => set('activity', a)} />
            ))}
          </View>

          <View style={{ flex: 1 }} />
          <BigButton label={t('common.continue')} onPress={next} style={{ marginTop: 20 }} />
        </Animated.View>
      )}

      {step === 3 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>{t('onb.goalTitle')}</Text>
          <Text style={styles.lead}>{t('onb.goalLead')}</Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 18 }}>
            <Chip label={t('goal.lose')} selected={d.goal === 'lose'} onPress={() => set('goal', 'lose')} />
            <Chip label={t('goal.maintain')} selected={d.goal === 'maintain'} onPress={() => set('goal', 'maintain')} />
            <Chip label={t('goal.gain')} selected={d.goal === 'gain'} onPress={() => set('goal', 'gain')} />
          </View>
          {d.goal !== 'maintain' && (
            <>
              <Text style={[styles.lead, { marginTop: 12, marginBottom: 6 }]}>{t('onb.howFast')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {[0.25, 0.5, 0.75, 1].map(pace => (
                  <Chip key={pace} label={t('onb.pace', { pace })} selected={d.paceKgPerWeek === pace} onPress={() => set('paceKgPerWeek', pace)} />
                ))}
              </View>
            </>
          )}

          <Animated.View entering={FadeInDown.springify()} key={budget} style={{ marginTop: 22 }}>
            <Card style={{ alignItems: 'center', paddingVertical: 24 }}>
              <Text style={styles.budgetLabel}>{t('onb.budgetLabel')}</Text>
              <Text style={styles.budgetBig}>{fmtKcal(budget)} kcal</Text>
              <Text style={styles.budgetSub}>
                {t('onb.budgetBurn', { kcal: fmtKcal(maintenance) })}{' '}
                {d.goal === 'lose'
                  ? t('onb.budgetLose', { kcal: fmtKcal(maintenance - budget) })
                  : d.goal === 'gain'
                    ? t('onb.budgetGain')
                    : t('onb.budgetMaintain')}
              </Text>
            </Card>
          </Animated.View>

          <View style={{ flex: 1 }} />
          <BigButton label={t('common.continue')} onPress={next} style={{ marginTop: 20 }} />
        </Animated.View>
      )}

      {step === 4 && (
        <Animated.View entering={FadeInRight} style={styles.stepBox}>
          <Text style={styles.title}>{t('onb.tricksTitle')}</Text>

          <Card style={{ marginTop: 16 }}>
            <Text style={styles.cardTitle}>{t('onb.handTitle')}</Text>
            <Text style={styles.cardText}>{t('onb.handText')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
              <Num value={d.handCm} onChange={v => set('handCm', v)} min={10} max={30} decimal />
              <Text style={{ color: C.muted }}>{t('common.cm')}</Text>
              <Pressable onPress={() => set('handCm', AVERAGE_HAND_CM)}>
                <Text style={{ color: C.amber, fontWeight: '600' }}>{t('onb.useAverage', { v: AVERAGE_HAND_CM })}</Text>
              </Pressable>
            </View>
          </Card>

          <Card style={{ marginTop: 12 }}>
            <Text style={styles.cardTitle}>{t('onb.nudgeTitle')}</Text>
            <Text style={styles.cardText}>{t('onb.nudgeText')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
              <Chip label={t('strict.off')} selected={d.strictness === 'off'} onPress={() => set('strictness', 'off')} />
              <Chip label={t('strict.gentle')} selected={d.strictness === 'gentle'} onPress={() => set('strictness', 'gentle')} />
              <Chip label={t('strict.normal')} selected={d.strictness === 'normal'} onPress={() => set('strictness', 'normal')} />
              <Chip label={t('strict.strict')} selected={d.strictness === 'strict'} onPress={() => set('strictness', 'strict')} />
            </View>
          </Card>

          <View style={{ flex: 1 }} />
          <BigButton label={t('onb.openCamera')} onPress={finish} style={{ marginTop: 20 }} />
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
  heroBox: {
    width: 86, height: 86, borderRadius: 8, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 22,
    backgroundColor: C.card,
  },
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
