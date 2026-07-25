// Persistent bottom navigation for the content screens. The camera stays the
// launch screen (a camera should open instantly), and this bar makes getting
// back to it, and to every other destination, a single tap. Fixes "finding the
// home page is hard": before this, Today was only reachable by tapping a pill
// on the camera.
//
// The centre item is the shutter shortcut back to the camera, sized up like a
// real camera app's capture button.
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { F, label, type Palette } from '@/constants/theme';
import { useColors } from '@/lib/theme-context';
import { Icon, type IconName } from '@/components/icons';

type Item = { route: string; icon: IconName; label: string };

const LEFT: Item[] = [
  { route: '/today', icon: 'cutlery', label: 'Today' },
  { route: '/diary', icon: 'gallery', label: 'Photos' },
];
const RIGHT: Item[] = [
  { route: '/stats', icon: 'chart', label: 'Stats' },
  { route: '/feed', icon: 'share', label: 'Feed' },
];

function TabItem({ item, active }: { item: Item; active: boolean }) {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable
      style={styles.item}
      hitSlop={6}
      onPress={() => {
        if (active) return;
        Haptics.selectionAsync();
        router.replace(item.route as never);
      }}
    >
      <Icon name={item.icon} size={21} color={active ? C.signal : C.faint} weight={active ? 2.1 : 1.8} />
      <Text style={[styles.label, { color: active ? C.signal : C.faint }]}>{item.label}</Text>
    </Pressable>
  );
}

export function TabBar() {
  const C = useColors();
  const styles = useMemo(() => makeStyles(C), [C]);
  const insets = useSafeAreaInsets();
  const path = usePathname();
  const isActive = (route: string) => path === route || (route === '/today' && path === '/');

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {LEFT.map(it => <TabItem key={it.route} item={it} active={isActive(it.route)} />)}

      {/* centre: back to the camera */}
      <Pressable
        style={styles.shutterWrap}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.replace('/'); }}
      >
        <View style={styles.shutter}>
          <Icon name="camera" size={24} color={C.onSignal} weight={2} />
        </View>
      </Pressable>

      {RIGHT.map(it => <TabItem key={it.route} item={it} active={isActive(it.route)} />)}
    </View>
  );
}

const makeStyles = (C: Palette) => StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingHorizontal: 14,
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  item: { flex: 1, alignItems: 'center', gap: 4, paddingTop: 4 },
  label: { ...label, fontSize: 8.5 },
  shutterWrap: { width: 64, alignItems: 'center', marginTop: -18 },
  shutter: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.signal,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 4, borderColor: C.bg,
  },
});
