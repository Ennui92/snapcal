// The onboarding demo: the whole app acted out in ten seconds. A mock camera
// snaps, a mock entry card analyzes itself, the budget ring fills. Advances
// on its own; a tap skips ahead; replayable.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { C, F, radius, shadow } from '@/constants/theme';
import { BudgetRing } from '@/components/budget-ring';
import { t } from '@/lib/i18n';
import { fmtKcal } from '@/lib/nutrition';
import { Icon } from '@/components/icons';

type Phase = 'shoot' | 'analyzing' | 'result' | 'ring';
const NEXT: Record<Phase, Phase | null> = { shoot: 'analyzing', analyzing: 'result', result: 'ring', ring: null };
const DWELL: Record<Phase, number> = { shoot: 1800, analyzing: 1700, result: 1900, ring: 0 };

const DEMO_KCAL = 412;
const DEMO_BUDGET = 1800;
const DEMO_CONSUMED = 1080;

export function DemoFlow() {
  const [phase, setPhase] = useState<Phase>('shoot');

  useEffect(() => {
    const next = NEXT[phase];
    if (!next) return;
    const timer = setTimeout(() => setPhase(next), DWELL[phase]);
    return () => clearTimeout(timer);
  }, [phase]);

  const advance = () => {
    const next = NEXT[phase];
    if (next) setPhase(next);
  };

  const stepNo = phase === 'shoot' ? 1 : phase === 'ring' ? 3 : 2;

  return (
    <Pressable onPress={advance} style={styles.box}>
      <View style={styles.stage}>
        {phase === 'shoot' && <CameraMock />}
        {(phase === 'analyzing' || phase === 'result') && <EntryMock done={phase === 'result'} />}
        {phase === 'ring' && (
          <Animated.View entering={FadeIn} style={{ alignItems: 'center' }}>
            <BudgetRing consumed={DEMO_CONSUMED} budget={DEMO_BUDGET} size={170} />
          </Animated.View>
        )}
      </View>

      <View style={styles.caption}>
        <Text style={styles.captionTitle}>
          {stepNo} · {phase === 'shoot' ? t('demo.phase1Title') : phase === 'ring' ? t('demo.phase3Title') : t('demo.phase2Title')}
        </Text>
        <Text style={styles.captionText}>
          {phase === 'shoot' ? t('demo.phase1Text') : phase === 'ring' ? t('demo.phase3Text') : t('demo.phase2Text')}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {[1, 2, 3].map(n => (
            <View key={n} style={[styles.dot, n === stepNo && styles.dotActive]} />
          ))}
        </View>
        {phase === 'ring' && (
          <Pressable onPress={() => setPhase('shoot')} hitSlop={10}>
            <Text style={styles.replay}>{t('demo.replay')}</Text>
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}

function CameraMock() {
  const pulse = useSharedValue(1);
  const flash = useSharedValue(0);

  useEffect(() => {
    pulse.value = withRepeat(withSequence(withTiming(0.9, { duration: 450 }), withTiming(1, { duration: 450 })), -1);
    // The "snap": a white blink shortly before the phase auto-advances.
    flash.value = withSequence(withTiming(0, { duration: 1250 }), withTiming(1, { duration: 90 }), withTiming(0, { duration: 260 }));
  }, [pulse, flash]);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <Animated.View entering={FadeIn} style={styles.cameraMock}>
      <Icon name="cutlery" size={54} color={C.signal} weight={1.4} />
      <Animated.View style={[styles.mockShutter, pulseStyle]}>
        <View style={styles.mockShutterInner} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.ink, borderRadius: radius.card }, flashStyle]} />
    </Animated.View>
  );
}

function EntryMock({ done }: { done: boolean }) {
  return (
    <Animated.View entering={FadeInDown.springify()} style={styles.entryMock}>
      <View style={styles.entryThumb}><Icon name="cutlery" size={22} color={C.faint} /></View>
      <View style={{ flex: 1, marginHorizontal: 12 }}>
        <Text style={styles.entryTitle} numberOfLines={2}>
          {done ? t('demo.mealName') : t('demo.analyzing')}
        </Text>
        {done && (
          <Animated.Text entering={FadeIn} style={styles.entryMeta}>{t('demo.mealItems')}</Animated.Text>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', minWidth: 56 }}>
        {done ? (
          <Animated.View entering={FadeIn} style={{ alignItems: 'flex-end' }}>
            <Text style={styles.entryKcal}>{fmtKcal(DEMO_KCAL)}</Text>
            <Text style={styles.entryKcalUnit}>kcal</Text>
          </Animated.View>
        ) : (
          <ActivityIndicator color={C.amber} />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: radius.card, padding: 16, ...shadow.soft,
  },
  stage: { height: 200, alignItems: 'center', justifyContent: 'center' },
  cameraMock: {
    width: '100%', height: 200, borderRadius: radius.card, backgroundColor: '#141210',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  mockShutter: {
    position: 'absolute', bottom: 12, width: 52, height: 52, borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  mockShutterInner: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: C.signal,
    borderWidth: 2, borderColor: C.amber,
  },
  entryMock: {
    width: '100%', flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.bg, borderColor: C.border, borderWidth: 1,
    borderRadius: radius.card, padding: 12,
  },
  entryThumb: {
    width: 56, height: 56, borderRadius: 10, backgroundColor: C.amberSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  entryTitle: { fontSize: 15, color: C.ink, fontWeight: '600' },
  entryMeta: { fontSize: 12, color: C.muted, marginTop: 3 },
  entryKcal: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  entryKcalUnit: { fontSize: 11, color: C.faint },
  caption: { marginTop: 14 },
  captionTitle: { fontFamily: F.heading, fontSize: 17, color: C.ink },
  captionText: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 4, minHeight: 60 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.border },
  dotActive: { backgroundColor: C.amber, width: 18 },
  replay: { color: C.amber, fontWeight: '700', fontSize: 14 },
});
