// Intermittent fasting timer. A fast is just a start time chasing a target
// duration; this screen starts one, watches it tick, and lets it end — same
// instrument language as the calorie ring on Today, just measuring hours
// instead of kcal.
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C, F, label, radius } from '@/constants/theme';
import { BigButton, Card, Chip, Grain, IconButton, ScreenHeader, Section } from '@/components/ui';
import { Icon } from '@/components/icons';
import { localeTag } from '@/lib/i18n';
import {
  CUSTOM_LABEL, endFast, type FastingSession, getActiveSession, getRecentSessions,
  initFasting, MAX_CUSTOM_HOURS, MIN_CUSTOM_HOURS, PRESETS, startFast,
} from '@/lib/fasting';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const SWEEP = 270;
const START = 135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, sweepDeg: number) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, fromDeg + sweepDeg);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0');

// Live stopwatch readout: H:MM:SS.
function fmtClock(ms: number): string {
  const total = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

// Short caption form: "3h 24m".
function fmtDurationShort(ms: number): string {
  const totalMin = Math.round(Math.abs(ms) / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

/** The fasting-hours version of the Today budget ring: same arc, same ticks,
 * except it fills with elapsed time against a hour target instead of kcal
 * against a budget. */
function FastRing({
  elapsedMs, targetMs, size = 236,
}: { elapsedMs: number; targetMs: number; size?: number }) {
  const stroke = 10;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2 - 12;
  const arcLen = r * ((SWEEP * Math.PI) / 180);

  const ratio = targetMs > 0 ? elapsedMs / targetMs : 0;
  const capped = Math.min(ratio, 1);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(capped, { duration: 600, easing: Easing.out(Easing.cubic) });
  }, [capped, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLen * (1 - progress.value),
  }));

  const tone = ratio <= 0.85 ? C.signal : ratio <= 1 ? C.ember : C.danger;
  const remaining = targetMs - elapsedMs;
  const over = remaining < 0;

  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const pct = i / 20;
    const deg = START + SWEEP * pct;
    const major = i % 5 === 0;
    const inner = polar(cx, cy, r + stroke / 2 + 5, deg);
    const outer = polar(cx, cy, r + stroke / 2 + (major ? 12 : 8), deg);
    const passed = pct <= capped;
    ticks.push(
      <Line
        key={i}
        x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
        stroke={passed ? tone : C.border}
        strokeWidth={major ? 1.6 : 1}
        opacity={passed ? 0.9 : 0.55}
      />,
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {ticks}
        <Path
          d={arcPath(cx, cy, r, START, SWEEP)}
          stroke={C.border} strokeWidth={stroke} fill="none" strokeLinecap="butt"
        />
        <AnimatedPath
          d={arcPath(cx, cy, r, START, SWEEP)}
          stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="butt"
          strokeDasharray={arcLen}
          animatedProps={animatedProps}
        />
        <Circle
          cx={polar(cx, cy, r, START + SWEEP).x}
          cy={polar(cx, cy, r, START + SWEEP).y}
          r={3.4}
          fill={over ? C.danger : C.faint}
        />
      </Svg>

      <Text style={styles.ringEyebrow}>{over ? 'PAST GOAL' : 'ELAPSED'}</Text>
      <Text style={[styles.ringBig, { color: over ? C.danger : C.ink }]}>{fmtClock(elapsedMs)}</Text>
      <View style={styles.ringSub}>
        <Icon name="flame" size={12} color={tone} weight={2} />
        <Text style={[styles.ringSubText, { color: tone }]}>
          {over ? `${fmtDurationShort(remaining)} over` : `${fmtDurationShort(remaining)} left`}
        </Text>
      </View>
    </View>
  );
}

function HistoryRow({ session }: { session: FastingSession }) {
  const start = new Date(session.startAt);
  const end = new Date(session.endAt!);
  const durationMs = end.getTime() - start.getTime();
  const dateLabel = start.toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
  const met = session.completed === 1;
  return (
    <View style={styles.histRow}>
      <View style={styles.histIcon}>
        <Icon name={met ? 'flame' : 'clock'} size={16} color={met ? C.signal : C.faint} weight={1.9} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.histDate}>{dateLabel}</Text>
        <Text style={styles.histTarget}>Target {session.targetHours}h</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.histDuration, { color: met ? C.signal : C.ink }]}>{fmtDurationShort(durationMs)}</Text>
        <Text style={[styles.histStatus, { color: met ? C.signal : C.faint }]}>{met ? 'Goal met' : 'Ended early'}</Text>
      </View>
    </View>
  );
}

export default function FastingScreen() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<FastingSession | null>(null);
  const [recent, setRecent] = useState<FastingSession[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string>(PRESETS[0].label);
  const [customHours, setCustomHours] = useState('24');

  const load = () => {
    setActive(getActiveSession());
    setRecent(getRecentSessions(10));
  };

  useEffect(() => {
    initFasting();
    load();
  }, []);

  // Live tick while a fast is running; no need to burn a timer otherwise.
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const selectedHours = useMemo(() => {
    if (selected === CUSTOM_LABEL) {
      const n = parseFloat(customHours.replace(',', '.'));
      if (!isFinite(n)) return 0;
      return Math.min(MAX_CUSTOM_HOURS, Math.max(MIN_CUSTOM_HOURS, n));
    }
    return PRESETS.find(p => p.label === selected)?.hours ?? PRESETS[0].hours;
  }, [selected, customHours]);

  const onStart = () => {
    if (active || selectedHours <= 0) return;
    startFast(selectedHours);
    load();
  };

  const onEnd = () => {
    if (!active) return;
    const elapsedMs = now - new Date(active.startAt).getTime();
    const targetMs = active.targetHours * 3_600_000;
    const doEnd = () => { endFast(); load(); };
    if (elapsedMs < targetMs) {
      Alert.alert(
        'End fast early?',
        `You're ${fmtDurationShort(elapsedMs)} into a ${active.targetHours}h fast. Ending now won't count as a completed fast.`,
        [
          { text: 'Keep fasting', style: 'cancel' },
          { text: 'End fast', style: 'destructive', onPress: doEnd },
        ],
      );
    } else {
      doEnd();
    }
  };

  const elapsedMs = active ? Math.max(0, now - new Date(active.startAt).getTime()) : 0;
  const targetMs = active ? active.targetHours * 3_600_000 : 0;
  const endAt = active ? new Date(new Date(active.startAt).getTime() + targetMs) : null;
  const overtime = active ? elapsedMs > targetMs : false;
  const stateLabel = active ? (overtime ? 'Fasting · past goal' : 'Fasting') : 'Eating window';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Grain />
      <ScreenHeader
        title="Fasting"
        left={<IconButton icon="back" onPress={() => router.back()} />}
      />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stateRow}>
          <Icon name={active ? 'flame' : 'clock'} size={13} color={active ? C.signal : C.faint} weight={2} />
          <Text style={styles.stateText}>{stateLabel}</Text>
        </View>

        {active ? (
          <>
            <View style={styles.ringWrap}>
              <FastRing elapsedMs={elapsedMs} targetMs={targetMs} />
            </View>
            {endAt && (
              <Text style={styles.endAtText}>
                {overtime ? 'Goal was' : 'Ends'} {endAt.toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' })}
                {'  ·  '}{active.targetHours}h target
              </Text>
            )}
            <BigButton label="End fast" kind="danger" icon="close" onPress={onEnd} style={{ marginTop: 22 }} />
          </>
        ) : (
          <>
            <Section title="Choose a window">
              <View style={styles.chipRow}>
                {PRESETS.map(p => (
                  <Chip key={p.label} label={p.label} selected={selected === p.label} onPress={() => setSelected(p.label)} />
                ))}
                <Chip label={CUSTOM_LABEL} selected={selected === CUSTOM_LABEL} onPress={() => setSelected(CUSTOM_LABEL)} />
              </View>
              {selected === CUSTOM_LABEL && (
                <Card style={{ marginTop: 4 }}>
                  <Text style={styles.customLabel}>FASTING HOURS</Text>
                  <View style={styles.customRow}>
                    <TextInput
                      value={customHours}
                      onChangeText={setCustomHours}
                      keyboardType="numeric"
                      placeholder="24"
                      placeholderTextColor={C.faint}
                      style={styles.customInput}
                      maxLength={4}
                    />
                    <Text style={styles.customUnit}>hours</Text>
                  </View>
                </Card>
              )}
            </Section>
            <BigButton label="Start fast" icon="clock" onPress={onStart} disabled={selectedHours <= 0} />
          </>
        )}

        <Section title="Recent fasts">
          {recent.length === 0 ? (
            <Text style={styles.emptyText}>No fasts logged yet. Your history will show up here.</Text>
          ) : (
            <Card style={{ padding: 0 }}>
              {recent.map((s, i) => (
                <View key={s.id} style={i > 0 ? styles.histDivider : undefined}>
                  <HistoryRow session={s} />
                </View>
              ))}
            </Card>
          )}
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  stateRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 6, marginBottom: 18,
  },
  stateText: { ...label, color: C.muted, fontSize: 11.5 },
  ringWrap: { alignItems: 'center', marginBottom: 4 },
  ringEyebrow: { ...label, fontSize: 10, color: C.faint, marginBottom: 4 },
  ringBig: { fontFamily: F.mono, fontSize: 44, letterSpacing: -1.5, lineHeight: 50 },
  ringSub: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  ringSubText: { fontFamily: F.monoLight, fontSize: 13 },
  endAtText: {
    textAlign: 'center', fontFamily: F.monoLight, fontSize: 12.5, color: C.muted, marginTop: 14,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap' },
  customLabel: { ...label, fontSize: 9.5, color: C.faint, marginBottom: 8 },
  customRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  customInput: {
    fontFamily: F.mono, fontSize: 28, color: C.ink, minWidth: 60, padding: 0,
  },
  customUnit: { ...label, fontSize: 11, color: C.faint },
  emptyText: { fontSize: 13, color: C.faint, lineHeight: 19 },
  histRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  histDivider: { borderTopWidth: 1, borderTopColor: C.hairline },
  histIcon: {
    width: 32, height: 32, borderRadius: radius.tile, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center',
  },
  histDate: { fontFamily: F.heading, fontSize: 14, color: C.ink },
  histTarget: { fontFamily: F.monoLight, fontSize: 11.5, color: C.faint, marginTop: 2 },
  histDuration: { fontFamily: F.mono, fontSize: 15 },
  histStatus: { ...label, fontSize: 9, marginTop: 3 },
});
