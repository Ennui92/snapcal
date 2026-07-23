// The day, as a light meter. A 270 degree instrument arc with real tick marks,
// a monospaced readout, and a hard mark at the budget line so "over" is a
// place you can see yourself crossing, not just a colour change.
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { C, F, label } from '@/constants/theme';
import { t } from '@/lib/i18n';
import { fmtKcal } from '@/lib/nutrition';

const AnimatedPath = Animated.createAnimatedComponent(Path);

const SWEEP = 270;
const START = 135;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, fromDeg: number, sweepDeg: number) {
  const a = polar(cx, cy, r, fromDeg);
  const b = polar(cx, cy, r, fromDeg + sweepDeg);
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${b.x} ${b.y}`;
}

export function BudgetRing({ consumed, budget, size = 236 }: { consumed: number; budget: number; size?: number }) {
  const stroke = 10;
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - stroke) / 2 - 12;
  const arcLen = r * ((SWEEP * Math.PI) / 180);

  const ratio = budget > 0 ? consumed / budget : 0;
  const capped = Math.min(ratio, 1);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(capped, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [capped, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: arcLen * (1 - progress.value),
  }));

  const tone = ratio <= 0.85 ? C.signal : ratio <= 1 ? C.ember : C.danger;
  const remaining = Math.round(budget - consumed);
  const over = remaining < 0;

  // Tick marks every 5%, longer every 25%. This is what makes it read as an
  // instrument rather than a progress donut.
  const ticks = [];
  for (let i = 0; i <= 20; i++) {
    const pct = i / 20;
    const deg = START + SWEEP * pct;
    const major = i % 5 === 0;
    const inner = polar(cx, cy, r + stroke / 2 + 5, deg);
    const outer = polar(cx, cy, r + stroke / 2 + (major ? 12 : 8), deg);
    const passed = pct <= capped;
    ticks.push(
      <Line
        key={i}
        x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
        stroke={passed ? tone : C.border}
        strokeWidth={major ? 1.6 : 1}
        opacity={passed ? 0.9 : 0.55}
      />,
    );
  }

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {ticks}
        <Path
          d={arcPath(cx, cy, r, START, SWEEP)}
          stroke={C.border} strokeWidth={stroke} fill="none" strokeLinecap="butt"
        />
        <AnimatedPath
          d={arcPath(cx, cy, r, START, SWEEP)}
          stroke={tone} strokeWidth={stroke} fill="none" strokeLinecap="butt"
          strokeDasharray={arcLen}
          animatedProps={animatedProps}
        />
        {/* the budget line itself, always visible at the end of the sweep */}
        <Circle
          cx={polar(cx, cy, r, START + SWEEP).x}
          cy={polar(cx, cy, r, START + SWEEP).y}
          r={3.4}
          fill={over ? C.danger : C.faint}
        />
      </Svg>

      <Text style={styles.eyebrow}>{over ? t('ring.over') : t('ring.left')}</Text>
      <Text style={[styles.big, { color: over ? C.danger : C.ink }]}>
        {fmtKcal(Math.abs(remaining))}
      </Text>
      <View style={styles.sub}>
        <Text style={[styles.subNum, { color: tone }]}>{fmtKcal(consumed)}</Text>
        <Text style={styles.subSep}>/</Text>
        <Text style={styles.subNum}>{fmtKcal(budget)}</Text>
        <Text style={styles.subUnit}>kcal</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { ...label, fontSize: 10, color: C.faint, marginBottom: 4 },
  big: { fontFamily: F.mono, fontSize: 54, color: C.ink, letterSpacing: -2.5, lineHeight: 60 },
  sub: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 6 },
  subNum: { fontFamily: F.monoLight, fontSize: 13, color: C.muted },
  subSep: { fontFamily: F.monoLight, fontSize: 13, color: C.faint },
  subUnit: { ...label, fontSize: 9, color: C.faint, marginLeft: 2 },
});
