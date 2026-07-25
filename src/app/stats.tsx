// History: 7/30/90 days of calories in vs calories burned, a net deficit
// readout, a colourful macro split, the weight trend, and a streak heatmap.
// Fitness data (burnedForRange) used to live only in the Today ring's bonus
// line — this is the first screen that actually charts it against intake.
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, label, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { BarChart, CHART_COLORS, Donut, Heatmap, LineChart, type BarDatum, type DonutSegment, type HeatCell } from '@/components/charts';
import { Card, Chip, IconButton, Section } from '@/components/ui';
import { Icon } from '@/components/icons';
import { TabBar } from '@/components/tab-bar';
import { anyProviderConnected, burnedForRange } from '@/lib/activity';
import { dayKeyFor, daySummaries, getEntriesForDay, getProfile, getWeights } from '@/lib/db';
import { fastingHoursForRange } from '@/lib/fasting';
import { t } from '@/lib/i18n';
import { effectiveBudget, fmtKcal } from '@/lib/nutrition';

type Range = 7 | 30 | 90;

type DayStat = { key: string; consumed: number; logged: boolean; burn: number; budget: number };

// Longest run of logged, on-budget days within the range (chronological order).
function bestStreak(days: DayStat[]): number {
  let best = 0;
  let cur = 0;
  for (const d of days) {
    if (d.logged && d.consumed <= d.budget) {
      cur++;
      best = Math.max(best, cur);
    } else {
      cur = 0;
    }
  }
  return best;
}

export default function StatsScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>(7);
  const profile = getProfile();
  const budget = profile.dailyBudgetKcal;
  const connected = anyProviderConnected();

  const days = useMemo<DayStat[]>(() => {
    const from = new Date();
    from.setDate(from.getDate() - (range - 1));
    const fromKey = dayKeyFor(from);
    const toKey = dayKeyFor(new Date());
    const sums = new Map(daySummaries(fromKey, toKey).map(s => [s.dayKey, s]));
    const burns = burnedForRange(fromKey, toKey);
    const out: DayStat[] = [];
    const cursor = new Date(from);
    for (let i = 0; i < range; i++) {
      const key = dayKeyFor(cursor);
      const s = sums.get(key);
      const burn = burns.get(key) ?? 0;
      out.push({
        key,
        consumed: s?.consumed ?? 0,
        logged: (s?.entries ?? 0) > 0,
        burn,
        budget: effectiveBudget(profile, burns.has(key) ? burn : null),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, profile.dailyBudgetKcal]);

  const loggedDays = days.filter(d => d.logged);
  const onBudgetDays = loggedDays.filter(d => d.consumed <= d.budget).length;
  const avg = loggedDays.length ? Math.round(loggedDays.reduce((a, d) => a + d.consumed, 0) / loggedDays.length) : 0;
  const net = loggedDays.reduce((a, d) => a + (d.consumed - d.budget), 0);
  const kg = net / 7700;
  const avgBurn = days.length ? Math.round(days.reduce((a, d) => a + d.burn, 0) / days.length) : 0;

  // Fasting, charted alongside eating instead of living on its own screen.
  const fasting = useMemo(() => {
    const map = fastingHoursForRange(days[0]?.key ?? dayKeyFor(new Date()), days[days.length - 1]?.key ?? dayKeyFor(new Date()));
    const hours = days.map(d => map.get(d.key) ?? 0);
    const fastedDays = hours.filter(h => h >= 1).length;
    const total = hours.reduce((a, h) => a + h, 0);
    return {
      hours,
      fastedDays,
      avg: fastedDays ? Math.round((total / fastedDays) * 10) / 10 : 0,
      longest: hours.length ? Math.round(Math.max(...hours) * 10) / 10 : 0,
      any: total > 0,
    };
  }, [days]);
  const streak = bestStreak(days);

  // Macro averages across logged days. Sugar is carved out of carbsG so the
  // four donut segments sum to (roughly) total logged calories, instead of
  // double-counting sugar inside carbs.
  const macros = useMemo(() => {
    let p = 0, c = 0, f = 0, s = 0;
    let loggedCount = 0;
    for (const d of days) {
      if (!d.logged) continue;
      loggedCount++;
      for (const e of getEntriesForDay(d.key)) {
        const w = e.eatenPct / 100;
        p += e.proteinG * w;
        c += e.carbsG * w;
        f += e.fatG * w;
        s += e.sugarG * w;
      }
    }
    const n = loggedCount || 1;
    return { protein: p / n, carbs: Math.max(0, c - s) / n, fat: f / n, sugar: s / n };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const macroKcal = {
    protein: macros.protein * 4,
    carbs: macros.carbs * 4,
    fat: macros.fat * 9,
    sugar: macros.sugar * 4,
  };
  const macroTotal = macroKcal.protein + macroKcal.carbs + macroKcal.fat + macroKcal.sugar;
  const macroPct = (kcal: number) => (macroTotal > 0 ? Math.round((kcal / macroTotal) * 100) : 0);

  const donutSegments: DonutSegment[] = [
    { value: macroKcal.protein, color: CHART_COLORS.protein },
    { value: macroKcal.carbs, color: CHART_COLORS.carbs },
    { value: macroKcal.fat, color: CHART_COLORS.fat },
    { value: macroKcal.sugar, color: CHART_COLORS.sugar },
  ];

  const weights = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - (range - 1));
    const fromKey = dayKeyFor(from);
    return getWeights().filter(w => w.date.slice(0, 10) >= fromKey);
  }, [range]);
  const weightVals = weights.map(w => w.weightKg);
  const weightMin = weightVals.length ? Math.min(...weightVals) : 0;
  const weightMax = weightVals.length ? Math.max(...weightVals) : 0;

  const heatCells: HeatCell[] = days.map(d => ({
    key: d.key,
    status: !d.logged ? 'empty' : d.consumed <= d.budget ? 'good' : 'bad',
  }));

  const barData: BarDatum[] = days.map(d => ({
    key: d.key, a: d.consumed, muted: !d.logged, b: connected ? d.burn : undefined,
  }));
  const maxBar = Math.max(
    budget * 1.2,
    ...days.map(d => d.consumed),
    ...(connected ? days.map(d => d.burn) : [0]),
    1,
  );

  const rangeLabel = range === 7 ? t('stats.week') : range === 30 ? t('stats.month') : '90 days';

  const share = async () => {
    const verdict = net < 0
      ? t('stats.shareUnder', { kcal: fmtKcal(-net), kg: Math.abs(kg).toFixed(1) })
      : t('stats.shareOver', { kcal: fmtKcal(net) });
    const extras: string[] = [];
    if (connected && avgBurn > 0) extras.push(`Averaging ${fmtKcal(avgBurn)} kcal burned a day.`);
    if (fasting.any) extras.push(`Fasted on ${fasting.fastedDays} ${fasting.fastedDays === 1 ? 'day' : 'days'}, averaging ${fasting.avg}h.`);
    await Share.share({
      message: t('stats.shareMsg', {
        label: rangeLabel,
        onBudget: onBudgetDays,
        logged: loggedDays.length,
        avg: fmtKcal(avg),
        budget: fmtKcal(budget),
        verdict,
      }) + (extras.length ? `\n${extras.join(' ')}` : ''),
    });
  };

  const shareLabel = range === 7 ? t('stats.shareWeek') : range === 30 ? t('stats.shareMonth') : 'Share my 90 days';

  return (
    <View style={styles.root}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 24, paddingHorizontal: 16 }}>
      <View style={styles.header}>
        <IconButton icon="back" onPress={() => router.back()} />
        <Text style={styles.headerTitle}>{t('stats.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.rangeRow}>
        <Chip label={t('stats.last7')} selected={range === 7} onPress={() => setRange(7)} />
        <Chip label={t('stats.last30')} selected={range === 30} onPress={() => setRange(30)} />
        <Chip label="Last 90 days" selected={range === 90} onPress={() => setRange(90)} />
      </View>

      <Section title="Calories in vs out">
        {!connected && (
          <Pressable onPress={() => router.push('/connections')}>
            <Card style={styles.connectCard}>
              <Icon name="link" size={18} color={C.signal} />
              <View style={{ flex: 1 }}>
                <Text style={styles.connectTitle}>See what you burn</Text>
                <Text style={styles.connectText}>Connect Strava or Health Connect to see what you burn.</Text>
              </View>
              <Icon name="chevron" size={16} color={C.faint} />
            </Card>
          </Pressable>
        )}
        <Card>
          <BarChart
            data={barData}
            colorA={CHART_COLORS.intake}
            colorB={connected ? CHART_COLORS.burn : undefined}
            maxValue={maxBar}
            budgetLine={budget}
            height={160}
          />
          <View style={styles.legendRow}>
            <LegendItem text="Eaten"><View style={[styles.legendSwatch, { backgroundColor: CHART_COLORS.intake }]} /></LegendItem>
            {connected && (
              <LegendItem text="Burned"><View style={[styles.legendSwatch, { backgroundColor: CHART_COLORS.burn }]} /></LegendItem>
            )}
            <LegendItem text={t('stats.budgetLine', { kcal: fmtKcal(budget) })}>
              <View style={[styles.legendDash, { backgroundColor: C.faint }]} />
            </LegendItem>
          </View>
        </Card>
      </Section>

      <Section title="Net balance">
        <Card style={[
          styles.netCard,
          { borderColor: net <= 0 ? C.signal : C.danger, backgroundColor: net <= 0 ? C.signalDim : C.dangerDim },
        ]}
        >
          <Text style={styles.netEyebrow}>{net <= 0 ? 'CALORIE DEFICIT' : 'CALORIE SURPLUS'}</Text>
          <Text style={[styles.netBig, { color: net <= 0 ? C.signal : C.danger }]}>
            {net <= 0 ? '−' : '+'}{fmtKcal(Math.abs(net))}
            <Text style={styles.netUnit}> kcal</Text>
          </Text>
          <Text style={[styles.netSub, { color: net <= 0 ? C.signal : C.danger }]}>
            ≈ {Math.abs(kg).toFixed(1)} kg {net <= 0 ? 'off' : 'on'} at this rate
          </Text>
          <Text style={styles.footnote}>{t('stats.footnote')}</Text>
        </Card>
      </Section>

      <Section title="Macros">
        <Card>
          <View style={styles.macroRow}>
            <Donut segments={donutSegments} />
            <View style={styles.macroList}>
              <MacroRow color={CHART_COLORS.protein} name="Protein" grams={macros.protein} pct={macroPct(macroKcal.protein)} />
              <MacroRow color={CHART_COLORS.carbs} name="Carbs" grams={macros.carbs} pct={macroPct(macroKcal.carbs)} />
              <MacroRow color={CHART_COLORS.fat} name="Fat" grams={macros.fat} pct={macroPct(macroKcal.fat)} />
              <MacroRow color={CHART_COLORS.sugar} name="Sugar" grams={macros.sugar} pct={macroPct(macroKcal.sugar)} />
            </View>
          </View>
        </Card>
      </Section>

      <Section title="Weight trend">
        <Card>
          {weightVals.length >= 2 ? (
            <>
              <LineChart values={weightVals} color={C.signal} height={110} />
              <View style={styles.minMaxRow}>
                <Text style={styles.minMaxText}>min {weightMin.toFixed(1)} kg</Text>
                <Text style={styles.minMaxText}>max {weightMax.toFixed(1)} kg</Text>
              </View>
            </>
          ) : (
            <View style={styles.emptyWeight}>
              <Icon name="scale" size={22} color={C.faint} weight={1.6} />
              <Text style={styles.emptyWeightText}>Log your weight in Settings to see the trend</Text>
            </View>
          )}
        </Card>
      </Section>

      {fasting.any && (
        <Section title="Fasting">
          <Card>
            <BarChart
              data={days.map((d, i) => ({ key: d.key, a: fasting.hours[i], muted: fasting.hours[i] < 1 }))}
              maxValue={Math.max(24, ...fasting.hours)}
              colorA={CHART_COLORS.fat}
            />
            <View style={styles.fastRow}>
              <View style={styles.fastCell}>
                <Text style={styles.fastNum}>{fasting.fastedDays}</Text>
                <Text style={styles.fastLabel}>days fasted</Text>
              </View>
              <View style={styles.fastCell}>
                <Text style={styles.fastNum}>{fasting.avg}h</Text>
                <Text style={styles.fastLabel}>average fast</Text>
              </View>
              <View style={styles.fastCell}>
                <Text style={styles.fastNum}>{fasting.longest}h</Text>
                <Text style={styles.fastLabel}>longest</Text>
              </View>
            </View>
          </Card>
        </Section>
      )}

      <Section title="Consistency">
        <Card>
          <Heatmap cells={heatCells} goodColor={C.signal} badColor={C.danger} />
          <View style={styles.legendRow}>
            <LegendItem text="On budget"><View style={[styles.legendSwatch, { backgroundColor: C.signal }]} /></LegendItem>
            <LegendItem text="Over budget"><View style={[styles.legendSwatch, { backgroundColor: C.danger }]} /></LegendItem>
            <LegendItem text="No log"><View style={[styles.legendSwatch, { backgroundColor: C.border }]} /></LegendItem>
          </View>
        </Card>
      </Section>

      <View style={styles.tileGrid}>
        <StatTile value={`${onBudgetDays}/${loggedDays.length}`} text={t('stats.daysOnBudget')} />
        <StatTile value={fmtKcal(avg)} text={t('stats.avgPerDay')} />
        <StatTile value={connected ? fmtKcal(avgBurn) : '—'} text="avg burn/day" />
        <StatTile value={String(streak)} text="best streak" />
      </View>

      <Pressable style={styles.shareBtn} onPress={share}>
        <Icon name="share" size={16} color={C.onSignal} weight={2} />
        <Text style={styles.shareBtnText}>{shareLabel}</Text>
      </Pressable>
    </ScrollView>
    <TabBar />
    </View>
  );
}

function LegendItem({ children, text }: { children: React.ReactNode; text: string }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.legendItem}>
      {children}
      <Text style={styles.legendText}>{text}</Text>
    </View>
  );
}

function MacroRow({ color, name, grams, pct }: { color: string; name: string; grams: number; pct: number }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.macroRowLine}>
      <View style={[styles.legendSwatch, { backgroundColor: color }]} />
      <Text style={styles.macroName}>{name}</Text>
      <Text style={styles.macroGrams}>{Math.round(grams)}g</Text>
      <Text style={styles.macroPct}>{pct}%</Text>
    </View>
  );
}

function StatTile({ value, text }: { value: string; text: string }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Card style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{text}</Text>
    </Card>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  fastRow: { flexDirection: 'row', marginTop: 14 },
  fastCell: { flex: 1, alignItems: 'center', gap: 3 },
  fastNum: { fontFamily: F.mono, fontSize: 19, color: C.ink },
  fastLabel: { ...label, fontSize: 8.5, color: C.faint },
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  rangeRow: { flexDirection: 'row', marginBottom: 16 },
  connectCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12,
    borderColor: C.signal, backgroundColor: C.signalDim,
  },
  connectTitle: { fontFamily: F.heading, fontSize: 14, color: C.ink, marginBottom: 2 },
  connectText: { fontSize: 12, color: C.muted, lineHeight: 16 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 9, height: 9, borderRadius: 2.5 },
  legendDash: { width: 12, height: 2, borderRadius: 1 },
  legendText: { fontSize: 11, color: C.muted },
  netCard: { borderWidth: 1, alignItems: 'center', paddingVertical: 22 },
  netEyebrow: { ...label, fontSize: 10.5, color: C.faint, marginBottom: 6 },
  netBig: { fontFamily: F.mono, fontSize: 40, letterSpacing: -1.5 },
  netUnit: { fontFamily: F.monoLight, fontSize: 15 },
  netSub: { fontSize: 13, fontFamily: F.monoLight, marginTop: 6 },
  footnote: { fontSize: 11, color: C.faint, marginTop: 12, textAlign: 'center' },
  macroRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  macroList: { flex: 1, gap: 10 },
  macroRowLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  macroName: { flex: 1, fontSize: 13, color: C.ink },
  macroGrams: { fontFamily: F.mono, fontSize: 12, color: C.muted, marginRight: 8 },
  macroPct: { fontFamily: F.mono, fontSize: 12, color: C.faint, width: 34, textAlign: 'right' },
  minMaxRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  minMaxText: { fontFamily: F.monoLight, fontSize: 11, color: C.faint },
  emptyWeight: { alignItems: 'center', paddingVertical: 22, gap: 10 },
  emptyWeightText: { fontSize: 13, color: C.muted, textAlign: 'center' },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  tile: { width: '47%', alignItems: 'center', paddingVertical: 18 },
  tileValue: { fontFamily: F.mono, fontSize: 22, color: C.ink },
  tileLabel: { fontSize: 11, color: C.muted, marginTop: 4, textAlign: 'center' },
  shareBtn: {
    marginTop: 20, backgroundColor: C.signal, borderRadius: radius.button,
    paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  shareBtnText: { color: C.onSignal, fontSize: 16, fontWeight: '700' },
});
