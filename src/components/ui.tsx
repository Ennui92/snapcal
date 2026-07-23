// Shared primitives. Squared corners, hairline rules, uppercase mono labels,
// one acid accent. Buttons are big because they get pressed one-handed while
// holding a fork.
import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F, label, radius } from '@/constants/theme';
import { Icon, type IconName } from '@/components/icons';

export function BigButton({
  label: text, onPress, kind = 'primary', style, disabled, icon,
}: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger';
  style?: StyleProp<ViewStyle>; disabled?: boolean; icon?: IconName;
}) {
  const fg = kind === 'primary' ? C.onSignal : kind === 'danger' ? C.danger : C.ink;
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' ? styles.btnPrimary : kind === 'danger' ? styles.btnDanger : styles.btnGhost,
        pressed && { transform: [{ scale: 0.985 }], opacity: 0.86 },
        disabled && { opacity: 0.35 },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={17} color={fg} weight={2.1} /> : null}
      <Text style={[styles.btnText, { color: fg }]}>{text}</Text>
    </Pressable>
  );
}

/** Tiny uppercase section label with a hairline rule running to the edge. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 26 }}>
      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.rule} />
      </View>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label: text, selected, onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && { opacity: 0.75 }]}
    >
      <Text style={[styles.chipText, selected && { color: C.onSignal }]}>{text}</Text>
    </Pressable>
  );
}

/** Square icon button used in every screen header. */
export function IconButton({
  icon, onPress, tone = 'default',
}: { icon: IconName; onPress: () => void; tone?: 'default' | 'signal' }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.iconBtn, pressed && { backgroundColor: C.raised }]}
      hitSlop={8}
    >
      <Icon name={icon} size={19} color={tone === 'signal' ? C.signal : C.ink} />
    </Pressable>
  );
}

/** Screen header: back/left action, tiny uppercase title, right action. */
export function ScreenHeader({
  title, left, right,
}: { title: string; left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerSide}>{left}</View>
      <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/** A number the user is judged by: monospaced, oversized, with a unit tag. */
export function Readout({
  value, unit, tone = 'ink', size = 34,
}: { value: string; unit?: string; tone?: 'ink' | 'signal' | 'danger' | 'muted'; size?: number }) {
  const color = tone === 'signal' ? C.signal : tone === 'danger' ? C.danger : tone === 'muted' ? C.muted : C.ink;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontFamily: F.mono, fontSize: size, color, letterSpacing: -1 }}>{value}</Text>
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

/** Film grain. Kills the flat plastic look of pure dark UI. */
export function Grain({ opacity = 0.035 }: { opacity?: number }) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Image
        source={require('@/assets/images/grain.png')}
        resizeMode="repeat"
        style={{ width: '100%', height: '100%' }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.button,
    paddingVertical: 17,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  btnPrimary: { backgroundColor: C.signal },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border },
  btnDanger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,68,56,0.4)' },
  btnText: {
    fontFamily: F.mono,
    fontSize: 13,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  sectionTitle: { ...label, color: C.faint },
  rule: { flex: 1, height: 1, backgroundColor: C.border },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: radius.card,
    padding: 16,
  },
  chip: {
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: radius.button,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: { backgroundColor: C.signal, borderColor: C.signal },
  chipText: { color: C.ink, fontWeight: '600', fontSize: 14 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.button,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 10,
  },
  headerSide: { width: 88, justifyContent: 'center' },
  headerTitle: { ...label, color: C.ink, fontSize: 11, flex: 1, textAlign: 'center' },
  unit: {
    fontFamily: F.monoLight,
    fontSize: 11,
    color: C.faint,
    marginLeft: 5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
