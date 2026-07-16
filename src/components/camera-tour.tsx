// First-launch coach marks on the camera: three tooltips pointing at the
// shutter, the budget pill and the gallery button. Tap anywhere to advance.
import React, { useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, radius } from '@/constants/theme';
import { t } from '@/lib/i18n';

export function CameraTour({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const W = Dimensions.get('window').width;

  const advance = () => {
    if (step >= 2) onDone();
    else setStep(step + 1);
  };

  // Highlight rings, matching the camera screen's layout: shutter centered at
  // the bottom, budget pill top-right, gallery button in the right third.
  const rings = [
    { bottom: insets.bottom + 12, alignSelf: 'center' as const, width: 96, height: 96, borderRadius: 48 },
    { top: insets.top + 2, right: 10, width: 150, height: 44, borderRadius: 22 },
    { bottom: insets.bottom + 12, left: W * (5 / 6) - 32, width: 64, height: 64, borderRadius: 16 },
  ];
  const tips = [
    { title: t('tour.shutterTitle'), text: t('tour.shutterText'), pos: { bottom: insets.bottom + 130, left: 24, right: 24 } },
    { title: t('tour.pillTitle'), text: t('tour.pillText'), pos: { top: insets.top + 60, left: 24, right: 24 } },
    { title: t('tour.galleryTitle'), text: t('tour.galleryText'), pos: { bottom: insets.bottom + 130, left: 24, right: 24 } },
  ];

  return (
    <Pressable style={styles.backdrop} onPress={advance}>
      <Animated.View key={`ring-${step}`} entering={FadeIn.duration(250)} style={[styles.ring, rings[step]]} />
      <Animated.View key={`tip-${step}`} entering={FadeIn.duration(250)} style={[styles.tip, tips[step].pos]}>
        <Text style={styles.tipTitle}>{tips[step].title}</Text>
        <Text style={styles.tipText}>{tips[step].text}</Text>
        <View style={styles.tipFooter}>
          <Text style={styles.tipCount}>{step + 1}/3</Text>
          <Text style={styles.tipNext}>{step === 2 ? t('tour.done') : t('tour.next')} →</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(20,18,16,0.62)', zIndex: 20,
  },
  ring: { position: 'absolute', borderWidth: 3, borderColor: '#fff' },
  tip: {
    position: 'absolute', backgroundColor: C.card, borderRadius: radius.card,
    padding: 16, borderWidth: 1, borderColor: C.border,
  },
  tipTitle: { fontFamily: F.heading, fontSize: 18, color: C.ink },
  tipText: { fontSize: 14, color: C.muted, lineHeight: 20, marginTop: 6 },
  tipFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  tipCount: { fontSize: 13, color: C.faint, fontWeight: '600' },
  tipNext: { fontSize: 14, color: C.amber, fontWeight: '700' },
});
