// Today's log: the budget ring, the streak, and every entry of the day.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, radius } from '@/constants/theme';
import { BudgetRing } from '@/components/budget-ring';
import { EntryCard } from '@/components/entry-card';
import { retryPending } from '@/lib/analyzer';
import { consumedForDay, dayKeyFor, daySummaries, getEntriesForDay, getProfile, type Entry } from '@/lib/db';
import { useStore } from '@/lib/store';

function streakDays(budget: number): number {
  // Count consecutive on-budget days with at least one entry, walking back from yesterday.
  // Today counts too if it's already under budget and logged.
  const today = dayKeyFor(new Date());
  const from = new Date();
  from.setDate(from.getDate() - 60);
  const sums = new Map(daySummaries(dayKeyFor(from), today).map(s => [s.dayKey, s]));

  let streak = 0;
  const cursor = new Date();
  const t = sums.get(today);
  if (t && t.entries > 0 && t.consumed <= budget) streak++;
  cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 60; i++) {
    const key = dayKeyFor(cursor);
    const s = sums.get(key);
    if (s && s.entries > 0 && s.consumed <= budget) streak++;
    else break;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function TodayScreen() {
  const { refresh, version } = useStore();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [consumed, setConsumed] = useState(0);
  const [streak, setStreak] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const profile = getProfile();

  const load = useCallback(() => {
    const day = dayKeyFor(new Date());
    setEntries(getEntriesForDay(day));
    setConsumed(consumedForDay(day));
    setStreak(streakDays(profile.dailyBudgetKcal));
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

  const dateLabel = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn}>
          <Text style={{ fontSize: 18 }}>📷</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{dateLabel}</Text>
        <Pressable onPress={() => router.push('/settings')} style={styles.headerBtn}>
          <Text style={{ fontSize: 18 }}>⚙️</Text>
        </Pressable>
      </View>

      <FlatList
        data={entries}
        keyExtractor={e => String(e.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.amber} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
        ListHeaderComponent={
          <View style={{ alignItems: 'center', marginBottom: 18 }}>
            <BudgetRing consumed={consumed} budget={profile.dailyBudgetKcal} />
            <View style={styles.badges}>
              {streak > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>🔥 {streak} day{streak === 1 ? '' : 's'} on track</Text>
                </View>
              )}
              <Pressable style={styles.badge} onPress={() => router.push('/stats')}>
                <Text style={styles.badgeText}>📈 history</Text>
              </Pressable>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 8 }}>🍽️</Text>
            <Text style={styles.emptyTitle}>Nothing logged yet</Text>
            <Text style={styles.emptyText}>Point the camera at your next meal and tap once.</Text>
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
    paddingHorizontal: 16, marginBottom: 10,
  },
  headerTitle: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  headerBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  badges: { flexDirection: 'row', marginTop: 14, gap: 8 },
  badge: {
    backgroundColor: C.amberSoft, borderRadius: radius.pill,
    paddingVertical: 7, paddingHorizontal: 14,
  },
  badgeText: { color: C.amber, fontWeight: '700', fontSize: 13 },
  empty: { alignItems: 'center', paddingVertical: 30 },
  emptyTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginBottom: 4 },
  emptyText: { color: C.muted, fontSize: 14 },
});
