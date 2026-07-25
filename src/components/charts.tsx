// Reusable SVG chart primitives for the Stats screen: a two-series bar chart
// (calories in vs out), a gradient-filled line chart (weight trend), a
// segmented donut (macro split), and a GitHub-style heatmap grid (streaks).
//
// Data-series colours are supplied by callers (see CHART_COLORS below) so the
// same primitive can be reused for different metrics; structural chrome
// (gridlines, empty-state fills) reads the live theme via useColors() so
// every chart stays legible in both light and dark mode.
import React, { useRef, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useColors } from '@/lib/theme-context';

/**
 * Small, fixed data-series palette — distinct from the app's semantic theme
 * colours (signal/danger/ember) and picked to stay legible as both a stroke
 * and a fill on a near-black *and* a near-white background.
 */
export const CHART_COLORS = {
  intake: '#4C8DFF', // calories eaten
  burn: '#FF7A45', // calories burned (fitness)
  protein: '#8B5CF6', // violet
  carbs: '#22B8CF', // cyan
  fat: '#F5A623', // amber
  sugar: '#EC4899', // pink / magenta
} as const;

// ---------------------------------------------------------------------------
// BarChart — one or two series of vertical bars, an optional dashed budget
// line, and per-bar muting for days with no data.
// ---------------------------------------------------------------------------

export type BarDatum = { key: string; a: number; b?: number; muted?: boolean };

export function BarChart({
  data, colorA, colorB, maxValue, budgetLine, height = 150,
}: {
  data: BarDatum[];
  colorA: string;
  colorB?: string;
  maxValue?: number;
  budgetLine?: number;
  height?: number;
}) {
  const C = useColors();
  const [width, setWidth] = useState(0);

  const max = Math.max(1, maxValue ?? Math.max(...data.map(d => Math.max(d.a, d.b ?? 0)), budgetLine ?? 0));
  const hasB = data.some(d => d.b != null);
  const gap = 2;
  const slotW = data.length ? width / data.length : 0;
  const barW = hasB ? Math.max(1, (slotW - gap * 3) / 2) : Math.max(1, slotW - gap * 2);
  const top = 4; // headroom so a full-height bar never touches the top edge

  return (
    <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          {data.map((d, i) => {
            const x = i * slotW;
            const aH = Math.max(1.5, (d.a / max) * (height - top));
            const bH = hasB && d.b != null ? Math.max(1.5, (d.b / max) * (height - top)) : 0;
            return (
              <G key={d.key}>
                <Rect
                  x={x + gap} y={height - aH} width={barW} height={aH} rx={2}
                  fill={colorA} opacity={d.muted ? 0.28 : 1}
                />
                {hasB && d.b != null && (
                  <Rect
                    x={x + gap * 2 + barW} y={height - bH} width={barW} height={bH} rx={2}
                    fill={colorB}
                  />
                )}
              </G>
            );
          })}
          {budgetLine != null && budgetLine > 0 && (
            <Line
              x1={0} x2={width}
              y1={height - (budgetLine / max) * (height - top)}
              y2={height - (budgetLine / max) * (height - top)}
              stroke={C.faint} strokeWidth={1.3} strokeDasharray="5,4" opacity={0.85}
            />
          )}
        </Svg>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// LineChart — a smoothed-looking polyline (straight segments, rounded joins)
// over a soft gradient fill. Renders nothing until it has a measured width or
// fewer than two points; callers own the empty-state copy.
// ---------------------------------------------------------------------------

export function LineChart({
  values, color, height = 120,
}: { values: number[]; color: string; height?: number }) {
  const [width, setWidth] = useState(0);
  const gradId = useRef(`chart-lg-${Math.random().toString(36).slice(2)}`).current;

  const hasData = values.length >= 2 && width > 0;
  const min = hasData ? Math.min(...values) : 0;
  const max = hasData ? Math.max(...values) : 0;
  const span = max - min || 1;
  const pad = 8;

  const pts = hasData
    ? values.map((v, i) => ({
      x: (i / (values.length - 1)) * width,
      y: pad + (1 - (v - min) / span) * (height - pad * 2),
    }))
    : [];
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const area = pts.length
    ? `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${height} L ${pts[0].x.toFixed(1)} ${height} Z`
    : '';

  return (
    <View style={{ height }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      {hasData && (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.35} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={area} fill={`url(#${gradId})`} stroke="none" />
          <Path d={line} fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          {pts.map((p, i) => (
            <Circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 3.6 : 2.2} fill={color} />
          ))}
        </Svg>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Donut — a stroke-based ring split into coloured arcs by value. Falls back
// to a plain themed ring outline when every value is zero.
// ---------------------------------------------------------------------------

export type DonutSegment = { value: number; color: string };

export function Donut({
  segments, size = 132, strokeWidth = 20,
}: { segments: DonutSegment[]; size?: number; strokeWidth?: number }) {
  const C = useColors();
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;

  if (total <= 0) {
    return (
      <Svg width={size} height={size}>
        <Circle cx={cx} cy={cy} r={r} stroke={C.border} strokeWidth={strokeWidth} fill="none" />
      </Svg>
    );
  }

  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} origin={`${cx}, ${cy}`}>
        {segments.filter(s => s.value > 0).map((s, i) => {
          const frac = s.value / total;
          const dash = Math.max(0, frac * circumference - 1.5); // hairline gap between arcs
          const el = (
            <Circle
              key={i}
              cx={cx} cy={cy} r={r}
              stroke={s.color} strokeWidth={strokeWidth} fill="none"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += frac * circumference;
          return el;
        })}
      </G>
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Heatmap — a GitHub-style calendar grid: columns are weeks, rows are the
// days within each week, oldest column first.
// ---------------------------------------------------------------------------

export type HeatCell = { key: string; status: 'good' | 'bad' | 'empty' };

export function Heatmap({
  cells, columns = 7, cellSize = 13, gap = 4, goodColor, badColor,
}: {
  cells: HeatCell[];
  columns?: number;
  cellSize?: number;
  gap?: number;
  goodColor: string;
  badColor: string;
}) {
  const C = useColors();
  const weeks: HeatCell[][] = [];
  for (let i = 0; i < cells.length; i += columns) weeks.push(cells.slice(i, i + columns));
  const colorFor = (s: HeatCell['status']) => (s === 'good' ? goodColor : s === 'bad' ? badColor : C.border);

  return (
    <View style={{ flexDirection: 'row', gap }}>
      {weeks.map((week, wi) => (
        <View key={wi} style={{ gap }}>
          {week.map(c => (
            <View
              key={c.key}
              style={{ width: cellSize, height: cellSize, borderRadius: 3, backgroundColor: colorFor(c.status) }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
