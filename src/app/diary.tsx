// The photo diary: BeReal-style photo grid by day (the default), or a clean
// chronological list — same data, two ways to look back at what was eaten.
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, label, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { Icon } from '@/components/icons';
import { IconButton } from '@/components/ui';
import { ListDayBlock, PhotoDayBlock, type DayGroup } from '@/components/photo-grid';
import { dayKeyFor, daySummaries, getEntriesForDay } from '@/lib/db';

type Mode = 'photo' | 'list';

const HISTORY_DAYS = 60;

export default function DiaryScreen() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>('photo');
  const [groups, setGroups] = useState<DayGroup[]>([]);

  // One daySummaries() call finds which of the last 60 days actually have
  // entries, then a single getEntriesForDay() per non-empty day pulls the
  // rows. Nothing is queried per render or inside the list's renderItem.
  const load = useCallback(() => {
    const toKey = dayKeyFor(new Date());
    const from = new Date();
    from.setDate(from.getDate() - (HISTORY_DAYS - 1));
    const fromKey = dayKeyFor(from);
    const summaries = daySummaries(fromKey, toKey).filter(s => s.entries > 0);
    const next: DayGroup[] = summaries
      .slice()
      .reverse() // newest day first
      .map(s => ({ dayKey: s.dayKey, totalKcal: s.consumed, entries: getEntriesForDay(s.dayKey) }));
    setGroups(next);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openEntry = useCallback((id: number) => { router.push(`/entry/${id}`); }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 10 }]}>
      <View style={styles.header}>
        <IconButton icon="back" onPress={() => router.back()} />

        <View style={styles.segment}>
          <Pressable
            onPress={() => setMode('photo')}
            style={[styles.segmentBtn, mode === 'photo' && styles.segmentBtnActive]}
          >
            <Icon name="gallery" size={14} color={mode === 'photo' ? C.onSignal : C.muted} weight={2} />
            <Text style={[styles.segmentText, mode === 'photo' && { color: C.onSignal }]}>Photo</Text>
          </Pressable>
          <Pressable
            onPress={() => setMode('list')}
            style={[styles.segmentBtn, mode === 'list' && styles.segmentBtnActive]}
          >
            <Icon name="chart" size={14} color={mode === 'list' ? C.onSignal : C.muted} weight={2} />
            <Text style={[styles.segmentText, mode === 'list' && { color: C.onSignal }]}>List</Text>
          </Pressable>
        </View>

        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={groups}
        keyExtractor={g => g.dayKey}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        renderItem={({ item }) => (
          mode === 'photo'
            ? <PhotoDayBlock group={item} onOpenEntry={openEntry} />
            : <ListDayBlock group={item} onOpenEntry={openEntry} />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="camera" size={26} color={C.faint} weight={1.6} />
            </View>
            <Text style={styles.emptyTitle}>No diary yet</Text>
            <Text style={styles.emptyText}>Snap your next meal and it will start showing up here.</Text>
          </View>
        }
      />
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 16, gap: 10,
  },
  segment: {
    flexDirection: 'row', backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: radius.button, padding: 3, gap: 3,
  },
  segmentBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.button - 2,
  },
  segmentBtnActive: { backgroundColor: C.signal },
  segmentText: { ...label, fontSize: 10, color: C.muted },
  empty: { alignItems: 'center', paddingVertical: 70, paddingHorizontal: 32 },
  emptyIcon: {
    width: 62, height: 62, borderRadius: radius.card, borderWidth: 1, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginBottom: 6, letterSpacing: -0.3 },
  emptyText: { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
