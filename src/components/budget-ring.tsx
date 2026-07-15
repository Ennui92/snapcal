import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedProps, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { C, F } from '@/constants/theme';
import { fmtKcal } from '@/lib/nutrition';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function BudgetRing({ consumed, budget, size = 210 }: { consumed: number; budget: number; size?: number }) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const ratio = budget > 0 ? consumed / budget : 0;
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(Math.min(ratio, 1), { duration: 900, easing: Easing.out(Easing.cubic) });
  }, [ratio, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const color = ratio < 0.85 ? C.green : ratio <= 1.05 ? C.amber : C.red;
  const remaining = Math.round(budget - consumed);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2} cy={size / 2} r={r}
          stroke={C.border} strokeWidth={stroke} fill="none"
        />
        <AnimatedCircle
          cx={size / 2} cy={size / 2} r={r}
          stroke={color} strokeWidth={stroke} fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[styles.big, { color: remaining >= 0 ? C.ink : C.red }]}>
        {fmtKcal(Math.abs(remaining))}
      </Text>
      <Text style={styles.label}>{remaining >= 0 ? 'kcal left' : 'kcal over'}</Text>
      <Text style={styles.sub}>{fmtKcal(consumed)} of {fmtKcal(budget)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  big: { fontFamily: F.heading, fontSize: 44, color: C.ink },
  label: { fontSize: 14, color: C.muted, marginTop: 2 },
  sub: { fontSize: 12, color: C.faint, marginTop: 6 },
});
