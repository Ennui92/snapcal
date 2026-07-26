// The shareable artwork. Two fixed-size, self-contained cards meant to be
// rendered off-screen, captured to a PNG by lib/social.ts, and then shared or
// posted to the local feed. This image is the growth engine: it has to look
// good enough that someone posts it unprompted, and it has to carry the
// SnapCal mark wherever it goes.
//
// Always rendered in the DARK palette, regardless of the app's live theme, so
// every shared image looks the same and reads as "SnapCal" at a glance. Never
// import useColors() in this file — take DARK directly.
import React, { forwardRef } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { DARK, F, radius } from '@/constants/theme';
import { Icon } from '@/components/icons';
import type { Entry } from '@/lib/db';
import { localeTag } from '@/lib/i18n';
import { fmtKcal, mealLabel } from '@/lib/nutrition';

const D = DARK;
const RATIO = 1.25; // 4:5, portrait — the size every share sheet expects

/** Aggregated numbers for a "my day" card. Built by the caller (feed.tsx) from db.ts reads. */
export type DaySharePayload = {
  dayKey: string;
  dateLabel: string; // already formatted, e.g. "Friday, 25 July"
  consumed: number;
  budget: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  streak: number;
  photos: string[]; // up to 4 photo uris
  /** Tracked exercise for the day, when a fitness provider is connected. */
  burn?: number | null;
  steps?: number;
  /** Hours spent fasting during the day, 0 when they weren't. */
  fastingHours?: number;
};

function Brand({ light = false }: { light?: boolean }) {
  return (
    <View style={styles.brand}>
      <View style={styles.brandMark}>
        <Icon name="bolt" size={12} color={D.onSignal} weight={2.4} />
      </View>
      <Text style={[styles.brandText, light && { color: D.ink }]}>SNAPCAL</Text>
    </View>
  );
}

function MacroChip({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.chipDot, { backgroundColor: tone }]} />
      <Text style={styles.chipValue}>{Math.round(value)}g</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

/** Poor man's gradient: react-native-svg has no <LinearGradient> guarantee
 * here, and expo-linear-gradient isn't in the allowed dep list, so the scrim
 * is stacked semi-transparent bands with an eased opacity curve. */
function Scrim({ height }: { height: number }) {
  const steps = 14;
  return (
    <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height }} pointerEvents="none">
      {Array.from({ length: steps }).map((_, i) => {
        const t = (i + 1) / steps;
        return <View key={i} style={{ flex: 1, backgroundColor: '#000000', opacity: Math.pow(t, 1.7) * 0.88 }} />;
      })}
    </View>
  );
}

function MiniRing({ size, ratio, tone }: { size: number; ratio: number; tone: string }) {
  const stroke = size * 0.09;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(ratio, 1));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={D.border} strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2} cy={size / 2} r={r} stroke={tone} strokeWidth={stroke} fill="none"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={offset} strokeLinecap="round"
        rotation={-90} origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}

/** A single logged meal, styled for sharing: full-bleed photo, dark scrim,
 * the description, a big mono kcal readout, and macro chips. */
export const MealShareCard = forwardRef<View, { entry: Entry; width?: number }>(
  function MealShareCard({ entry, width = 360 }, ref) {
    const height = Math.round(width * RATIO);
    const consumed = Math.round((entry.totalKcal * entry.eatenPct) / 100);
    const time = new Date(entry.takenAt).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });

    return (
      <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
        {entry.photoUri ? (
          <Image source={{ uri: entry.photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.photoFallback]}>
            <Icon name="cutlery" size={width * 0.16} color={D.faint} weight={1.4} />
          </View>
        )}

        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', opacity: 0.12 }]} />
        <Scrim height={height * 0.62} />

        <View style={styles.topRow}>
          <Brand />
        </View>

        <View style={styles.bottomBlock}>
          <Text style={styles.eyebrowLight}>{mealLabel(entry.mealType)}  ·  {time}</Text>
          <Text style={styles.descLight} numberOfLines={3}>{entry.description || 'A meal, logged'}</Text>

          <View style={styles.kcalRow}>
            <Text style={styles.kcalNum}>{fmtKcal(consumed)}</Text>
            <Text style={styles.kcalUnitLight}>KCAL IN</Text>
          </View>

          <View style={styles.chipsRow}>
            <MacroChip label="Protein" value={entry.proteinG} tone={D.signal} />
            <MacroChip label="Carbs" value={entry.carbsG} tone={D.ember} />
            <MacroChip label="Fat" value={entry.fatG} tone={D.ink} />
          </View>

          <Text style={styles.taglineLight}>snapped with SnapCal</Text>
        </View>
      </View>
    );
  },
);

/** A whole day, styled for sharing: total vs. budget as a ring, macro split,
 * meal count, streak, and a strip of the day's photos. */
export const DayShareCard = forwardRef<View, { summary: DaySharePayload; width?: number }>(
  function DayShareCard({ summary, width = 360 }, ref) {
    const height = Math.round(width * RATIO);
    const ratio = summary.budget > 0 ? summary.consumed / summary.budget : 0;
    const tone = ratio <= 0.85 ? D.signal : ratio <= 1 ? D.ember : D.danger;
    const remaining = Math.round(summary.budget - summary.consumed);
    const totalMacro = summary.proteinG + summary.carbsG + summary.fatG;
    const ringSize = width * 0.5;

    return (
      <View ref={ref} collapsable={false} style={[styles.dayCard, { width, height }]}>
        <View style={styles.topRow}>
          <Brand light />
        </View>

        <Text style={styles.dayDate}>{summary.dateLabel}</Text>

        <View style={[styles.ringWrap, { width: ringSize, height: ringSize }]}>
          <MiniRing size={ringSize} ratio={ratio} tone={tone} />
          <View style={styles.ringCenter}>
            {/* Without this label the number is ambiguous: eaten, left, or burned? */}
            <Text style={styles.ringEyebrow}>Calories in</Text>
            <Text style={[styles.ringNum, { color: tone }]}>{fmtKcal(summary.consumed)}</Text>
            <Text style={styles.ringUnit}>of {fmtKcal(summary.budget)} budget</Text>
          </View>
        </View>

        <Text style={[styles.verdict, remaining < 0 && { color: D.danger }]}>
          {remaining >= 0 ? `${fmtKcal(remaining)} kcal under budget` : `${fmtKcal(-remaining)} kcal over budget`}
        </Text>

        {totalMacro > 0 && (
          <View style={styles.macroBar}>
            <View style={{ flex: Math.max(summary.proteinG, 0.001), backgroundColor: D.signal }} />
            <View style={{ flex: Math.max(summary.carbsG, 0.001), backgroundColor: D.ember }} />
            <View style={{ flex: Math.max(summary.fatG, 0.001), backgroundColor: D.ink }} />
          </View>
        )}
        <View style={styles.chipsRow}>
          <MacroChip label="Protein" value={summary.proteinG} tone={D.signal} />
          <MacroChip label="Carbs" value={summary.carbsG} tone={D.ember} />
          <MacroChip label="Fat" value={summary.fatG} tone={D.ink} />
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statBlock}>
            <Text style={styles.statNum}>{summary.mealCount}</Text>
            <Text style={styles.statLabel}>Meals logged</Text>
          </View>
          {summary.streak > 0 && (
            <View style={styles.statBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="flame" size={16} color={D.ember} weight={2} />
                <Text style={styles.statNum}>{summary.streak}</Text>
              </View>
              <Text style={styles.statLabel}>Day streak</Text>
            </View>
          )}
          {/* A day is not just what you ate: show the training and the fast,
              which is what makes the card worth posting. */}
          {summary.burn != null && summary.burn > 0 && (
            <View style={styles.statBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="bolt" size={16} color={D.signal} weight={2} />
                <Text style={styles.statNum}>{Math.round(summary.burn)}</Text>
              </View>
              <Text style={styles.statLabel}>Kcal burned</Text>
            </View>
          )}
          {summary.fastingHours != null && summary.fastingHours >= 1 && (
            <View style={styles.statBlock}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Icon name="clock" size={16} color={D.ink} weight={2} />
                <Text style={styles.statNum}>{Math.round(summary.fastingHours)}h</Text>
              </View>
              <Text style={styles.statLabel}>Fasted</Text>
            </View>
          )}
        </View>

        {summary.photos.length > 0 && (
          <View style={styles.photoStrip}>
            {summary.photos.slice(0, 4).map((uri, i) => (
              <Image key={i} source={{ uri }} style={styles.photoThumb} />
            ))}
          </View>
        )}

        <Text style={styles.tagline}>my day, tracked with SnapCal</Text>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  ringEyebrow: {
    fontFamily: F.mono, fontSize: 8, letterSpacing: 1.4, textTransform: 'uppercase',
    color: D.muted, marginBottom: 1,
  },
  card: {
    backgroundColor: D.bg,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  dayCard: {
    backgroundColor: D.bg,
    borderRadius: radius.card,
    overflow: 'hidden',
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 18,
    alignItems: 'center',
  },
  photoFallback: { backgroundColor: D.raised, alignItems: 'center', justifyContent: 'center' },

  topRow: { position: 'absolute', top: 18, left: 20, right: 20, flexDirection: 'row', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  brandMark: {
    width: 20, height: 20, borderRadius: 5, backgroundColor: D.signal,
    alignItems: 'center', justifyContent: 'center',
  },
  brandText: { fontFamily: F.mono, fontSize: 11, letterSpacing: 2.4, color: '#FFFFFF' },

  bottomBlock: { position: 'absolute', left: 20, right: 20, bottom: 18 },
  eyebrowLight: {
    fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.8, textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.68)', marginBottom: 8,
  },
  descLight: { fontFamily: F.display, fontSize: 21, lineHeight: 25, color: '#FFFFFF', marginBottom: 12 },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 14 },
  kcalNum: { fontFamily: F.mono, fontSize: 52, letterSpacing: -2, color: D.signal },
  kcalUnitLight: {
    fontFamily: F.mono, fontSize: 12, letterSpacing: 2, color: 'rgba(255,255,255,0.65)', marginLeft: 8,
  },
  taglineLight: { fontFamily: F.monoLight, fontSize: 9.5, letterSpacing: 1, color: 'rgba(255,255,255,0.45)', marginTop: 14 },
  tagline: { fontFamily: F.monoLight, fontSize: 9.5, letterSpacing: 1, color: D.faint, marginTop: 14 },

  chipsRow: { flexDirection: 'row', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', borderRadius: radius.button,
    paddingVertical: 7, paddingHorizontal: 10,
  },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipValue: { fontFamily: F.mono, fontSize: 13, color: '#FFFFFF' },
  chipLabel: { fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)' },

  dayDate: {
    fontFamily: F.display, fontSize: 19, color: D.ink, marginTop: 46, marginBottom: 18, textAlign: 'center',
  },
  ringWrap: { alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringNum: { fontFamily: F.mono, fontSize: 30, letterSpacing: -1.2 },
  ringUnit: { fontFamily: F.monoLight, fontSize: 10, color: D.faint, marginTop: 3 },
  verdict: { fontFamily: F.mono, fontSize: 12.5, color: D.signal, letterSpacing: 0.3, marginBottom: 16 },
  macroBar: {
    flexDirection: 'row', width: '100%', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: D.raised, marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', gap: 28, marginTop: 16, marginBottom: 16 },
  statBlock: { alignItems: 'center' },
  statNum: { fontFamily: F.mono, fontSize: 18, color: D.ink },
  statLabel: {
    fontFamily: F.mono, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: D.faint, marginTop: 3,
  },
  photoStrip: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  photoThumb: { width: 58, height: 58, borderRadius: radius.tile, backgroundColor: D.raised },
});
