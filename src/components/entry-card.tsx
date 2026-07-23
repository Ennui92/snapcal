// A log row, styled like a contact sheet: square frame, hairline rule, the
// number set in mono on the right. No floating card, no drop shadow.
import React, { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { C, F, label, radius } from '@/constants/theme';
import { Icon } from '@/components/icons';
import type { Entry } from '@/lib/db';
import { localeTag, t } from '@/lib/i18n';
import { fmtKcal, mealLabel } from '@/lib/nutrition';

function PulseDot() {
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
  return <Animated.View style={[styles.dot, style]} />;
}

export function EntryCard({ entry, onPress, index = 0 }: { entry: Entry; onPress: () => void; index?: number }) {
  const time = new Date(entry.takenAt).toLocaleTimeString(localeTag(), { hour: '2-digit', minute: '2-digit' });
  const consumed = (entry.totalKcal * entry.eatenPct) / 100;
  const pending = entry.status === 'pending' || entry.status === 'analyzing';

  const meta = [mealLabel(entry.mealType), time, entry.eatenPct !== 100 ? t('card.ate', { pct: entry.eatenPct }) : null]
    .filter(Boolean)
    .join('  ·  ');

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 45).springify().damping(18)}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.card }]}>
        <View style={styles.frame}>
          {entry.photoUri ? (
            <Image source={{ uri: entry.photoUri }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Icon name="cutlery" size={20} color={C.faint} />
            </View>
          )}
          {pending && <View style={styles.scanline} />}
        </View>

        <View style={{ flex: 1, marginHorizontal: 13 }}>
          <Text style={styles.title} numberOfLines={2}>
            {entry.status === 'done' && entry.description
              ? entry.description
              : entry.status === 'error'
                ? t('card.failed')
                : t('card.looking')}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>{meta}</Text>
        </View>

        <View style={styles.right}>
          {entry.status === 'done' ? (
            <>
              <Text style={styles.kcal}>{fmtKcal(consumed)}</Text>
              <Text style={styles.kcalUnit}>kcal</Text>
            </>
          ) : entry.status === 'error' ? (
            <Icon name="warn" size={19} color={C.danger} />
          ) : (
            <PulseDot />
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.hairline,
  },
  frame: {
    width: 58,
    height: 58,
    borderRadius: radius.tile,
    borderWidth: 1,
    borderColor: C.border,
    overflow: 'hidden',
    backgroundColor: C.card,
  },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  scanline: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: 2,
    backgroundColor: C.signal,
    opacity: 0.9,
  },
  title: { fontSize: 15, color: C.ink, fontWeight: '600', lineHeight: 20 },
  meta: { ...label, fontSize: 9.5, color: C.faint, marginTop: 5 },
  right: { alignItems: 'flex-end', minWidth: 62 },
  kcal: { fontFamily: F.mono, fontSize: 19, color: C.ink, letterSpacing: -0.6 },
  kcalUnit: { ...label, fontSize: 8.5, color: C.faint, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: C.signal },
});
