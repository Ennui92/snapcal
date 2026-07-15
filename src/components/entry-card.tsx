import React from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { C, F, radius, shadow } from '@/constants/theme';
import type { Entry } from '@/lib/db';
import { fmtKcal, MEAL_EMOJI } from '@/lib/nutrition';

export function EntryCard({ entry, onPress, index = 0 }: { entry: Entry; onPress: () => void; index?: number }) {
  const time = new Date(entry.takenAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const consumed = (entry.totalKcal * entry.eatenPct) / 100;

  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify()}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.98 }] }]}>
        {entry.photoUri ? (
          <Image source={{ uri: entry.photoUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbFallback]}>
            <Text style={{ fontSize: 24 }}>{MEAL_EMOJI[entry.mealType] ?? '🍽️'}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={styles.title} numberOfLines={2}>
            {entry.status === 'done' && entry.description
              ? entry.description
              : entry.status === 'error'
                ? 'Analysis failed. Tap to retry.'
                : 'Looking at your plate…'}
          </Text>
          <Text style={styles.meta}>
            {MEAL_EMOJI[entry.mealType] ?? ''} {entry.mealType} · {time}
            {entry.eatenPct !== 100 ? ` · ate ${entry.eatenPct}%` : ''}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', minWidth: 64 }}>
          {entry.status === 'done' ? (
            <>
              <Text style={styles.kcal}>{fmtKcal(consumed)}</Text>
              <Text style={styles.kcalUnit}>kcal</Text>
            </>
          ) : entry.status === 'error' ? (
            <Text style={{ fontSize: 20 }}>⚠️</Text>
          ) : (
            <ActivityIndicator color={C.amber} />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 10,
    marginBottom: 10,
    ...shadow.soft,
  },
  thumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: C.bg },
  thumbFallback: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  title: { fontSize: 15, color: C.ink, fontWeight: '600' },
  meta: { fontSize: 12, color: C.muted, marginTop: 3, textTransform: 'capitalize' },
  kcal: { fontFamily: F.heading, fontSize: 20, color: C.ink },
  kcalUnit: { fontSize: 11, color: C.faint },
});
