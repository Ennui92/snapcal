// History: last 7 or 30 days against budget, net balance, and sharing.
// Deficit = weight coming off. The math is shown, not hidden.
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, radius } from '@/constants/theme';
import { Card, Chip } from '@/components/ui';
import { dayKeyFor, daySummaries, getProfile } from '@/lib/db';
import { fmtKcal } from '@/lib/nutrition';

type Range = 7 | 30;

export default function StatsScreen() {
  const insets = useSafeAreaInsets();
  const [range, setRange] = useState<Range>(7);
  const profile = getProfile();
  const budget = profile.dailyBudgetKcal;

  const days = useMemo(() => {
    const from = new Date();
    from.setDate(from.getDate() - (range - 1));
    const sums = new Map(daySummaries(dayKeyFor(from), dayKeyFor(new Date())).map(s => [s.dayKey, s]));
    const out: { key: string; consumed: number; logged: boolean }[] = [];
    const cursor = new Date(from);
    for (let i = 0; i < range; i++) {
      const key = dayKeyFor(cursor);
      const s = sums.get(key);
      out.push({ key, consumed: s?.consumed ?? 0, logged: (s?.entries ?? 0) > 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }, [range]);

  const loggedDays = days.filter(d => d.logged);
  const onBudgetDays = loggedDays.filter(d => d.consumed <= budget).length;
  const avg = loggedDays.length ? Math.round(loggedDays.reduce((a, d) => a + d.consumed, 0) / loggedDays.length) : 0;
  const net = loggedDays.reduce((a, d) => a + (d.consumed - budget), 0);
  const kg = net / 7700;

  const maxBar = Math.max(budget * 1.2, ...days.map(d => d.consumed), 1);

  const share = async () => {
    const label = range === 7 ? 'week' : 'month';
    const verdict = net < 0
      ? `Net ${fmtKcal(-net)} kcal under budget, roughly ${Math.abs(kg).toFixed(1)} kg coming off.`
      : `Net ${fmtKcal(net)} kcal over budget.`;
    await Share.share({
      message:
        `My SnapCal ${label}: ${onBudgetDays}/${loggedDays.length} days on budget, ` +
        `averaging ${fmtKcal(avg)} kcal a day (budget ${fmtKcal(budget)}). ${verdict} ` +
        `📸 Logged with SnapCal: photo in, calories out.`,
    });
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32, paddingHorizontal: 16 }}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={{ fontSize: 16 }}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>History</Text>
        <View style={{ width: 42 }} />
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 16 }}>
        <Chip label="Last 7 days" selected={range === 7} onPress={() => setRange(7)} />
        <Chip label="Last 30 days" selected={range === 30} onPress={() => setRange(30)} />
      </View>

      <Card>
        <View style={styles.barRow}>
          {days.map(d => {
            const h = Math.max(4, (d.consumed / maxBar) * 120);
            const over = d.consumed > budget;
            return (
              <View key={d.key} style={styles.barSlot}>
                <View style={[styles.bar, { height: h, backgroundColor: !d.logged ? C.border : over ? C.red : C.green }]} />
              </View>
            );
          })}
        </View>
        {/* budget line */}
        <View style={[styles.budgetLine, { bottom: 16 + (budget / maxBar) * 120 }]} />
        <Text style={styles.budgetLineLabel}>budget {fmtKcal(budget)}</Text>
      </Card>

      <View style={styles.statRow}>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{onBudgetDays}/{loggedDays.length}</Text>
          <Text style={styles.statLabel}>days on budget</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{fmtKcal(avg)}</Text>
          <Text style={styles.statLabel}>avg kcal/day</Text>
        </Card>
      </View>
      <View style={styles.statRow}>
        <Card style={[styles.statCard, { backgroundColor: net <= 0 ? C.greenSoft : C.redSoft, borderColor: net <= 0 ? C.green : C.red }]}>
          <Text style={[styles.statNum, { color: net <= 0 ? C.green : C.red }]}>
            {net <= 0 ? '−' : '+'}{fmtKcal(Math.abs(net))}
          </Text>
          <Text style={styles.statLabel}>net kcal vs budget</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={styles.statNum}>{kg <= 0 ? '−' : '+'}{Math.abs(kg).toFixed(1)} kg</Text>
          <Text style={styles.statLabel}>estimated effect*</Text>
        </Card>
      </View>
      <Text style={styles.footnote}>* rough estimate: 7,700 kcal ≈ 1 kg of body fat</Text>

      <Pressable style={styles.shareBtn} onPress={share}>
        <Text style={styles.shareBtnText}>Share my {range === 7 ? 'week' : 'month'}</Text>
      </Pressable>
    </ScrollView>
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
  barRow: { flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 3 },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: { width: '80%', borderRadius: 4 },
  budgetLine: {
    position: 'absolute', left: 16, right: 16, height: 1.5,
    backgroundColor: C.amber, opacity: 0.75,
  },
  budgetLineLabel: { fontSize: 11, color: C.amber, marginTop: 8, textAlign: 'right' },
  statRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statNum: { fontFamily: F.heading, fontSize: 24, color: C.ink },
  statLabel: { fontSize: 12, color: C.muted, marginTop: 4 },
  footnote: { fontSize: 11, color: C.faint, marginTop: 8 },
  shareBtn: {
    marginTop: 20, backgroundColor: C.amber, borderRadius: radius.button,
    paddingVertical: 16, alignItems: 'center',
  },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
