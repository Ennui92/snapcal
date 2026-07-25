// Building blocks for the BeReal-style photo diary: a bold hero photo per
// day, a tight grid for the rest, and a plain list row for List mode. This
// file is self-contained on purpose — it does not import EntryCard, so the
// diary screen has zero coupling to the day log's row component.
import React, { useEffect, useMemo } from 'react';
import { Dimensions, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { F, label, radius, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { Icon } from '@/components/icons';
import { dayKeyFor, type Entry } from '@/lib/db';
import { fmtKcal, mealLabel } from '@/lib/nutrition';

export type DayGroup = { dayKey: string; totalKcal: number; entries: Entry[] };

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = 3;

// "Today" / "Yesterday" / "Sat 12 Jul" — reads straight off the dayKey the
// entry is already grouped under, so no extra timezone math is needed here.
export function dayLabel(dayKey: string): string {
  const todayKey = dayKeyFor(new Date());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const yesterdayKey = dayKeyFor(y);
  if (dayKey === todayKey) return 'Today';
  if (dayKey === yesterdayKey) return 'Yesterday';
  const [yy, mm, dd] = dayKey.split('-').map(Number);
  return new Date(yy, mm - 1, dd, 12).toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function PulseDot() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const o = useSharedValue(0.35);
  useEffect(() => {
    o.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.3, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [o]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.pulseDot, style]} />;
}

function DayHeader({ dayKey, totalKcal }: { dayKey: string; totalKcal: number }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.dayHeader}>
      <Text style={styles.dayHeaderTitle}>{dayLabel(dayKey)}</Text>
      <Text style={styles.dayHeaderKcal}>{fmtKcal(totalKcal)} kcal</Text>
    </View>
  );
}

function StatusCorner({ entry }: { entry: Entry }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  if (entry.status === 'error') {
    return (
      <View style={[styles.badge, styles.badgeBottomRight]}>
        <Icon name="warn" size={12} color="#FF8A80" />
      </View>
    );
  }
  if (entry.status === 'pending' || entry.status === 'analyzing') {
    return (
      <View style={[styles.badge, styles.badgeBottomRight]}>
        <PulseDot />
      </View>
    );
  }
  const consumed = (entry.totalKcal * entry.eatenPct) / 100;
  return (
    <View style={[styles.badge, styles.badgeBottomRight]}>
      <Text style={styles.badgeKcal}>{fmtKcal(consumed)}</Text>
    </View>
  );
}

// One BeReal-ish tile: a photo, a scrim-backed time badge top-left, and a
// kcal (or status) badge bottom-right. Tight rounded corners, thin border.
function PhotoFrame({ entry, width, height, onPress }: {
  entry: Entry; width: number; height: number; onPress: () => void;
}) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable onPress={onPress} style={[styles.frame, { width, height }]}>
      <Image source={{ uri: entry.photoUri! }} style={styles.frameImg} />
      <View style={[styles.badge, styles.badgeTopLeft]}>
        <Text style={styles.badgeTime}>{timeLabel(entry.takenAt)}</Text>
      </View>
      <StatusCorner entry={entry} />
    </Pressable>
  );
}

// Photo-less entries still show up, as a compact row so nothing is hidden.
function TextTile({ entry, onPress }: { entry: Entry; onPress: () => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const consumed = (entry.totalKcal * entry.eatenPct) / 100;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.textTile, pressed && { backgroundColor: C.raised }]}>
      <View style={styles.textTileIcon}>
        <Icon name="cutlery" size={16} color={C.faint} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 10 }}>
        <Text style={styles.textTileTitle} numberOfLines={1}>
          {entry.description || mealLabel(entry.mealType)}
        </Text>
        <Text style={styles.textTileMeta}>{timeLabel(entry.takenAt)}</Text>
      </View>
      {entry.status === 'done' ? (
        <Text style={styles.textTileKcal}>{fmtKcal(consumed)}</Text>
      ) : entry.status === 'error' ? (
        <Icon name="warn" size={16} color={C.danger} />
      ) : (
        <PulseDot />
      )}
    </Pressable>
  );
}

// PHOTO mode, one day: first photo goes big and full-width, the rest flow
// into a tight 2- or 3-up grid beneath it, then any photo-less entries.
export function PhotoDayBlock({ group, onOpenEntry }: { group: DayGroup; onOpenEntry: (id: number) => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const photoEntries = group.entries.filter(e => e.photoUri);
  const textEntries = group.entries.filter(e => !e.photoUri);
  const [hero, ...rest] = photoEntries;
  const cols = rest.length > 6 ? 3 : 2;
  const tileSize = (SCREEN_W - GRID_GAP * (cols - 1)) / cols;

  return (
    <View style={styles.dayBlock}>
      <DayHeader dayKey={group.dayKey} totalKcal={group.totalKcal} />

      {hero && (
        <Animated.View
          entering={FadeInDown.delay(0).springify().damping(18)}
          style={{ marginBottom: rest.length || textEntries.length ? GRID_GAP : 0 }}
        >
          <PhotoFrame entry={hero} width={SCREEN_W} height={SCREEN_W * 0.75} onPress={() => onOpenEntry(hero.id)} />
        </Animated.View>
      )}

      {rest.length > 0 && (
        <View style={styles.grid}>
          {rest.map((e, i) => (
            <Animated.View
              key={e.id}
              entering={FadeInDown.delay(Math.min(i + 1, 6) * 45).springify().damping(18)}
              style={{ marginRight: (i + 1) % cols === 0 ? 0 : GRID_GAP, marginBottom: GRID_GAP }}
            >
              <PhotoFrame entry={e} width={tileSize} height={tileSize} onPress={() => onOpenEntry(e.id)} />
            </Animated.View>
          ))}
        </View>
      )}

      {textEntries.length > 0 && (
        <View style={styles.textTileWrap}>
          {textEntries.map((e, i) => (
            <Animated.View key={e.id} entering={FadeInDown.delay(Math.min(i, 6) * 45).springify().damping(18)}>
              <TextTile entry={e} onPress={() => onOpenEntry(e.id)} />
            </Animated.View>
          ))}
        </View>
      )}

      {!hero && textEntries.length === 0 && (
        <View style={{ height: 4 }} />
      )}
    </View>
  );
}

function ListRow({ entry, index, onPress }: { entry: Entry; index: number; onPress: () => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const consumed = (entry.totalKcal * entry.eatenPct) / 100;
  const meta = [mealLabel(entry.mealType), timeLabel(entry.takenAt), entry.eatenPct !== 100 ? `ate ${entry.eatenPct}%` : null]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 45).springify().damping(18)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.listRow, pressed && { backgroundColor: C.raised }]}>
        <View style={styles.listFrame}>
          {entry.photoUri ? (
            <Image source={{ uri: entry.photoUri }} style={styles.listThumb} />
          ) : (
            <View style={[styles.listThumb, styles.listThumbFallback]}>
              <Icon name="cutlery" size={18} color={C.faint} />
            </View>
          )}
        </View>
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {entry.status === 'done' && entry.description
              ? entry.description
              : entry.status === 'error'
                ? 'Failed to analyze'
                : 'Looking...'}
          </Text>
          <Text style={styles.listMeta} numberOfLines={1}>{meta}</Text>
        </View>
        {entry.status === 'done' ? (
          <Text style={styles.listKcal}>{fmtKcal(consumed)}</Text>
        ) : entry.status === 'error' ? (
          <Icon name="warn" size={17} color={C.danger} />
        ) : (
          <PulseDot />
        )}
      </Pressable>
    </Animated.View>
  );
}

// LIST mode, one day: a clean chronological stack, own row component (not
// EntryCard) so this file has no dependency on it.
export function ListDayBlock({ group, onOpenEntry }: { group: DayGroup; onOpenEntry: (id: number) => void }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={styles.dayBlock}>
      <DayHeader dayKey={group.dayKey} totalKcal={group.totalKcal} />
      <View style={{ paddingHorizontal: 16 }}>
        {group.entries.map((e, i) => (
          <ListRow key={e.id} entry={e} index={i} onPress={() => onOpenEntry(e.id)} />
        ))}
      </View>
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  dayBlock: { marginBottom: 22 },
  dayHeader: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: 16, marginBottom: 8,
  },
  dayHeaderTitle: { fontFamily: F.heading, fontSize: 19, color: C.ink, letterSpacing: -0.3 },
  dayHeaderKcal: { fontFamily: F.mono, fontSize: 13, color: C.faint, letterSpacing: -0.3 },

  frame: {
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    backgroundColor: C.card,
  },
  frameImg: { width: '100%', height: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 0 },

  badge: {
    position: 'absolute',
    paddingHorizontal: 7,
    paddingVertical: 3.5,
    borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  badgeTopLeft: { top: 7, left: 7 },
  badgeBottomRight: { bottom: 7, right: 7 },
  badgeTime: { ...label, fontSize: 9.5, color: '#FFFFFF', letterSpacing: 0.4 },
  badgeKcal: { fontFamily: F.mono, fontSize: 11, color: '#FFFFFF' },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.signal },

  textTileWrap: { paddingHorizontal: 16, marginTop: 2, gap: 8 },
  textTile: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.border, borderRadius: radius.card,
    paddingVertical: 10, paddingHorizontal: 12,
  },
  textTileIcon: {
    width: 32, height: 32, borderRadius: radius.tile, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  textTileTitle: { fontSize: 14, color: C.ink, fontWeight: '600' },
  textTileMeta: { ...label, fontSize: 9, color: C.faint, marginTop: 3 },
  textTileKcal: { fontFamily: F.mono, fontSize: 15, color: C.ink },

  listRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.hairline,
  },
  listFrame: {
    width: 54, height: 54, borderRadius: radius.tile, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden', backgroundColor: C.card,
  },
  listThumb: { width: '100%', height: '100%' },
  listThumbFallback: { alignItems: 'center', justifyContent: 'center' },
  listTitle: { fontSize: 15, color: C.ink, fontWeight: '600', lineHeight: 20 },
  listMeta: { ...label, fontSize: 9, color: C.faint, marginTop: 4 },
  listKcal: { fontFamily: F.mono, fontSize: 17, color: C.ink, letterSpacing: -0.5 },
});
