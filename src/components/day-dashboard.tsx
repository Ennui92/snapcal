// The daily summary that used to be missing. Three things the old Today screen
// hid or never showed at all:
//   1. Energy balance — what you ate vs what fitness says you burned, and the
//      net. Previously the tracked burn was a single grey line of text.
//   2. Macros — protein / carbs / fat / sugar as coloured bars, so the day has
//      a shape at a glance instead of one calorie number.
//   3. Fasting — live on the dashboard (running timer or a one-tap start),
//      instead of buried behind a button nobody found.
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { F, label, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { Icon } from '@/components/icons';
import type { Entry } from '@/lib/db';
import { fmtKcal } from '@/lib/nutrition';
import { endFast, getActiveSession, PRESETS, startFast, type FastingSession } from '@/lib/fasting';

// Macro colours. Deliberately distinct from the single accent so the day reads
// as data, not decoration. These are tuned to sit on both light and dark.
export const MACRO_COLORS = {
  protein: '#8B7BF7',
  carbs: '#3BC8E0',
  fat: '#FFB020',
  sugar: '#F2568F',
};

export type DayMacros = { protein: number; carbs: number; fat: number; sugar: number };

/** Sum macros across a day's entries, honouring the eaten percentage. */
export function macrosFor(entries: Entry[]): DayMacros {
  return entries.reduce<DayMacros>((acc, e) => {
    const f = (e.eatenPct ?? 100) / 100;
    acc.protein += (e.proteinG ?? 0) * f;
    acc.carbs += (e.carbsG ?? 0) * f;
    acc.fat += (e.fatG ?? 0) * f;
    acc.sugar += (e.sugarG ?? 0) * f;
    return acc;
  }, { protein: 0, carbs: 0, fat: 0, sugar: 0 });
}

function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Calories in vs out vs net. The fitness payoff, finally on screen. */
export function EnergyBalance({
  consumed, burn, steps,
}: { consumed: number; burn: number | null; steps: number }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const connected = burn != null;
  const net = consumed - (burn ?? 0);

  if (!connected) {
    return (
      <Pressable style={styles.connectCard} onPress={() => router.push('/connections')}>
        <Icon name="bolt" size={16} color={C.signal} weight={2} />
        <Text style={styles.connectText}>
          Connect Strava, Health Connect or Oura to see what you burn
        </Text>
        <Icon name="chevron" size={14} color={C.faint} />
      </Pressable>
    );
  }

  return (
    <View style={styles.balanceRow}>
      <View style={styles.balanceCell}>
        <Text style={styles.balanceLabel}>In</Text>
        <Text style={[styles.balanceNum, { color: C.ink }]}>{fmtKcal(consumed)}</Text>
      </View>
      <View style={styles.balanceDivider} />
      <View style={styles.balanceCell}>
        <Text style={styles.balanceLabel}>Out</Text>
        <Text style={[styles.balanceNum, { color: MACRO_COLORS.carbs }]}>{fmtKcal(burn ?? 0)}</Text>
        {steps > 0 && <Text style={styles.balanceSub}>{steps.toLocaleString()} steps</Text>}
      </View>
      <View style={styles.balanceDivider} />
      <View style={styles.balanceCell}>
        <Text style={styles.balanceLabel}>Net</Text>
        <Text style={[styles.balanceNum, { color: net <= 0 ? C.signal : C.ember }]}>
          {net <= 0 ? '−' : '+'}{fmtKcal(Math.abs(net))}
        </Text>
      </View>
    </View>
  );
}

/** Protein / carbs / fat / sugar as proportional coloured bars. */
export function MacroBars({ macros }: { macros: DayMacros }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const rows = [
    { key: 'protein', label: 'Protein', grams: macros.protein, color: MACRO_COLORS.protein },
    { key: 'carbs', label: 'Carbs', grams: macros.carbs, color: MACRO_COLORS.carbs },
    { key: 'fat', label: 'Fat', grams: macros.fat, color: MACRO_COLORS.fat },
    { key: 'sugar', label: 'Sugar', grams: macros.sugar, color: MACRO_COLORS.sugar },
  ];
  const max = Math.max(...rows.map(r => r.grams), 1);
  const total = macros.protein + macros.carbs + macros.fat;

  if (total <= 0) return null;

  return (
    <View style={styles.macroCard}>
      {rows.map(r => (
        <View key={r.key} style={styles.macroRow}>
          <Text style={styles.macroLabel}>{r.label}</Text>
          <View style={styles.macroTrack}>
            <View style={[styles.macroFill, { width: `${Math.min(100, (r.grams / max) * 100)}%`, backgroundColor: r.color }]} />
          </View>
          <Text style={styles.macroGrams}>{Math.round(r.grams)}g</Text>
        </View>
      ))}
    </View>
  );
}

/** Fasting, right on the dashboard: live timer when running, else one tap to start. */
export function FastingStrip() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const [session, setSession] = useState<FastingSession | null>(() => getActiveSession());
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!session) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [session]);

  if (!session) {
    const preset = PRESETS[0];
    return (
      <View style={styles.fastIdle}>
        <Icon name="clock" size={15} color={C.muted} weight={2} />
        <Text style={styles.fastIdleText}>Not fasting</Text>
        <Pressable
          style={styles.fastStartBtn}
          onPress={() => { startFast(preset.hours); setSession(getActiveSession()); }}
        >
          <Text style={styles.fastStartText}>Start {preset.label}</Text>
        </Pressable>
        <Pressable onPress={() => router.push('/fasting')} hitSlop={8}>
          <Icon name="chevron" size={14} color={C.faint} />
        </Pressable>
      </View>
    );
  }

  const started = new Date(session.startAt).getTime();
  const elapsed = now - started;
  const targetMs = session.targetHours * 3600 * 1000;
  const pct = Math.min(1, elapsed / targetMs);
  const done = elapsed >= targetMs;

  return (
    <Pressable style={styles.fastActive} onPress={() => router.push('/fasting')}>
      <View style={styles.fastHead}>
        <View style={styles.fastHeadLeft}>
          <Icon name="clock" size={15} color={done ? C.signal : C.ember} weight={2.1} />
          <Text style={[styles.fastState, { color: done ? C.signal : C.ember }]}>
            {done ? 'Goal reached' : 'Fasting'}
          </Text>
        </View>
        <Text style={styles.fastTimer}>{fmtDuration(elapsed)}</Text>
      </View>
      <View style={styles.fastTrack}>
        <View style={[styles.fastFill, { width: `${pct * 100}%`, backgroundColor: done ? C.signal : C.ember }]} />
      </View>
      <View style={styles.fastFoot}>
        <Text style={styles.fastFootText}>{session.targetHours}h target</Text>
        <Pressable
          onPress={() => { endFast(); setSession(null); }}
          hitSlop={8}
        >
          <Text style={[styles.fastFootText, { color: C.danger }]}>End fast</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  connectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    paddingVertical: 12, paddingHorizontal: 14, marginTop: 16,
    backgroundColor: C.card,
  },
  connectText: { flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 17 },

  balanceRow: {
    flexDirection: 'row', alignItems: 'stretch', marginTop: 16,
    borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    backgroundColor: C.card, paddingVertical: 14,
  },
  balanceCell: { flex: 1, alignItems: 'center', gap: 3 },
  balanceDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },
  balanceLabel: { ...label, fontSize: 8.5, color: C.faint },
  balanceNum: { fontFamily: F.mono, fontSize: 20, letterSpacing: -0.8 },
  balanceSub: { fontSize: 10, color: C.faint },

  macroCard: {
    marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    backgroundColor: C.card, padding: 14, gap: 9,
  },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  macroLabel: { ...label, fontSize: 8.5, color: C.muted, width: 52 },
  macroTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: C.raised, overflow: 'hidden' },
  macroFill: { height: '100%', borderRadius: 4 },
  macroGrams: { fontFamily: F.mono, fontSize: 12, color: C.ink, width: 42, textAlign: 'right' },

  fastIdle: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    backgroundColor: C.card, paddingVertical: 11, paddingHorizontal: 14,
  },
  fastIdleText: { flex: 1, ...label, fontSize: 9, color: C.muted },
  fastStartBtn: {
    borderRadius: radius.button, borderWidth: 1, borderColor: C.signal,
    paddingVertical: 6, paddingHorizontal: 12,
  },
  fastStartText: { ...label, fontSize: 8.5, color: C.signal },

  fastActive: {
    marginTop: 12, borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    backgroundColor: C.card, padding: 14, gap: 9,
  },
  fastHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fastHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  fastState: { ...label, fontSize: 9 },
  fastTimer: { fontFamily: F.mono, fontSize: 17, color: C.ink, letterSpacing: -0.5 },
  fastTrack: { height: 5, borderRadius: 3, backgroundColor: C.raised, overflow: 'hidden' },
  fastFill: { height: '100%', borderRadius: 3 },
  fastFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fastFootText: { ...label, fontSize: 8.5, color: C.faint },
});
