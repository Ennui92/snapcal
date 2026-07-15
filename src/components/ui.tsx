// Small shared primitives: big friendly buttons, section headers, chips.
import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, F, radius, shadow } from '@/constants/theme';

export function BigButton({
  label, onPress, kind = 'primary', style, disabled,
}: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost'; style?: StyleProp<ViewStyle>; disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.btn,
        kind === 'primary' ? styles.btnPrimary : styles.btnGhost,
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Text style={[styles.btnText, kind === 'primary' ? { color: '#fff' } : { color: C.ink }]}>{label}</Text>
    </Pressable>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 22 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Chip({
  label, selected, onPress,
}: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.button,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    ...shadow.soft,
  },
  btnPrimary: { backgroundColor: C.amber },
  btnGhost: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  btnText: { fontSize: 17, fontWeight: '700' },
  sectionTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink, marginBottom: 10 },
  card: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: radius.card,
    padding: 16,
    ...shadow.soft,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: { backgroundColor: C.amber, borderColor: C.amber },
  chipText: { color: C.ink, fontWeight: '600', fontSize: 14 },
});
