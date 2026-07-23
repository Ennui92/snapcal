// Today's log: the meter, the streak, and every entry of the day.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, label, radius } from '@/constants/theme';
import { BudgetRing } from '@/components/budget-ring';
import { EntryCard } from '@/components/entry-card';
import { Icon, type IconName } from '@/components/icons';
import { Grain, IconButton } from '@/components/ui';
import { budgetForDay, burnedForRange } from '@/lib/activity';
import { retryPending } from '@/lib/analyzer';
import { consumedForDay, dayKeyFor, daySummaries, getEntriesForDay, getProfile, type Profile, type Entry } from '@/lib/db';
import { localeTag, t } from '@/lib/i18n';
import { effectiveBudget, fmtKcal } from '@/lib/nutrition';
import { useStore } from '@/lib/store';

function streakDays(profile: Profile): number {
  // Count consecutive on-budget days with at least one entry, walking back from yesterday.
  // Today counts too if it's already under budget and logged. Each day is held
  // against its own effective budget (tracked workouts raise the line).
  const today = dayKeyFor(new Date());
  const from = new Date();
  from.setDate(from.getDate() - 60);
  const fromKey = dayKeyFor(from);
  const sums = new Map(daySummaries(fromKey, today).map(s => [s.dayKey, s]));
  const burns = burnedForRange(fromKey, today);
  const onBudget = (key: string) => {
    const s = sums.get(key);
    return !!s && s.entries > 0 && s.consumed <= effectiveBudget(profile, burns.get(key) ?? null);
  };

  let streak = 0;
  const cursor = new Date();
  if (onBudget(today)) streak++;
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    if (onBudget(dayKeyFor(cursor))) streak++;
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function Tab({ icon, text, onPress, tone = 'default' }: {
  icon: IconName; text: string; onPress: () => void; tone?: 'default' | 'signal';
}) {
  const color = tone === 'signal' ? C.signal : C.ink;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tab, pressed && { backgroundColor: C.raised }]}>
      <Icon name={icon} size={14} color={color} weight={2} />
      <Text style={[styles.tabText, { color }]}>{text}</Text>
    </Pressable>
  );
}

export default function TodayScreen() {
  const { refresh, version } = useStore();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [consumed, setConsumed] = useState(0);
  const [budget, setBudget] = useState(0);
  const [burn, setBurn] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const profile = getProfile();

  const load = useCallback(() => {
    const day = dayKeyFor(new Date());
    setEntries(getEntriesForDay(day));
    setConsumed(consumedForDay(day));
    const b = budgetForDay(profile, day);
    setBudget(b.budget);
    setBurn(b.burn);
    setStreak(streakDays(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.dailyBudgetKcal]);

  useFocusEffect(useCallback(() => { load(); }, [load, version]));

  // Poll while anything is still analyzing so results appear without user action.
  const hasPending = entries.some(e => e.status === 'pending' || e.status === 'analyzing');
  React.useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => { load(); }, 2500);
    return () => clearInterval(t);
  }, [hasPending, load]);

  const onRefresh = () => {
    setRefreshing(true);
    retryPending();
    setTimeout(() => { load(); setRefreshing(false); }, 1200);
  };

  const dateLabel = new Date().toLocaleDateString(localeTag(), { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <Grain />
      <View style={styles.header}>
        <IconButton icon="camera" onPress={() => router.back()} />
        <Text style={styles.headerTitle} numberOfLines={1}>{dateLabel}</Text>
        <IconButton icon="settings" onPress={() => router.push('/settings')} />
      </View>

      <FlatList
        data={entries}
        keyExtractor={e => String(e.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.signal} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <BudgetRing consumed={consumed} budget={budget} />
            {burn != null && burn > 0 && (
              <Pressable onPress={() => router.push('/connections')} style={styles.burnRow}>
                <Icon name="bolt" size={13} color={C.signal} weight={2} />
                <Text style={styles.burnBonus}>{t('today.burnBonus', { kcal: fmtKcal(burn) })}</Text>
              </Pressable>
            )}
            {streak > 0 && (
              <View style={styles.streak}>
                <Icon name="flame" size={14} color={C.ember} weight={1.9} />
                <Text style={styles.streakText}>
                  {streak === 1 ? t('today.streakOne') : t('today.streakMany', { n: streak })}
                </Text>
              </View>
            )}
            <View style={styles.tabs}>
              <Tab icon="chart" text={t('today.history')} onPress={() => router.push('/stats')} />
              <Tab icon="plus" text={t('today.addManual')} onPress={() => router.push('/add')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="cutlery" size={26} color={C.faint} weight={1.6} />
            </View>
            <Text style={styles.emptyTitle}>{t('today.emptyTitle')}</Text>
            <Text style={styles.emptyText}>{t('today.emptyText')}</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <EntryCard entry={item} index={index} onPress={() => router.push(`/entry/${item.id}`)} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 16, gap: 12,
  },
  headerTitle: { ...label, fontSize: 10.5, color: C.ink, flex: 1, textAlign: 'center' },
  burnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  burnBonus: { ...label, fontSize: 9.5, color: C.signal },
  streak: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12,
    borderWidth: 1, borderColor: C.border, borderRadius: radius.button,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  streakText: { ...label, fontSize: 9.5, color: C.ink },
  tabs: { flexDirection: 'row', marginTop: 18, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    borderWidth: 1, borderColor: C.border, borderRadius: radius.button,
    paddingVertical: 11, paddingHorizontal: 16,
  },
  tabText: { ...label, fontSize: 9.5, color: C.ink },
  empty: { alignItems: 'center', paddingVertical: 34 },
  emptyIcon: {
    width: 62, height: 62, borderRadius: radius.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginBottom: 6, letterSpacing: -0.3 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
