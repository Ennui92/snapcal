// SnapCal design system: "Darkroom", now with a light mode.
//
// Colours live in two palettes with identical shape. Screens read the ACTIVE
// palette through `useColors()` (see lib/theme-context) and build their styles
// with `makeStyles(C)`, so a theme switch re-renders everything. `C` below is
// the dark palette, exported for module-scope code and as a safe default; the
// camera screen stays dark in both themes on purpose (a camera lives in the
// dark).
//
// The light accent is a deeper green rather than acid lime: lime text is
// unreadable on white, so the same `signal` key is a colour that works both as
// text and as a fill in each theme.

export type Palette = {
  bg: string; card: string; raised: string; border: string; hairline: string;
  ink: string; muted: string; faint: string;
  signal: string; signalDim: string; onSignal: string;
  ember: string; emberDim: string; danger: string; dangerDim: string;
  overlay: string;
  // legacy aliases kept so older code compiles unchanged
  amber: string; amberSoft: string; green: string; greenSoft: string;
  red: string; redSoft: string;
};

export const DARK: Palette = {
  bg: '#08080A',
  card: '#131317',
  raised: '#1C1C21',
  border: '#26262D',
  hairline: '#1E1E24',
  ink: '#F7F7F4',
  muted: '#9695A0',
  faint: '#5C5B66',
  signal: '#C8FA3C',
  signalDim: 'rgba(200,250,60,0.14)',
  onSignal: '#0A0A0B',
  ember: '#FF8A1F',
  emberDim: 'rgba(255,138,31,0.14)',
  danger: '#FF4438',
  dangerDim: 'rgba(255,68,56,0.14)',
  overlay: 'rgba(4,4,6,0.72)',
  amber: '#C8FA3C',
  amberSoft: 'rgba(200,250,60,0.14)',
  green: '#C8FA3C',
  greenSoft: 'rgba(200,250,60,0.14)',
  red: '#FF4438',
  redSoft: 'rgba(255,68,56,0.14)',
};

export const LIGHT: Palette = {
  bg: '#FAF9F6',
  card: '#FFFFFF',
  raised: '#F1EFEA',
  border: '#E4E2DB',
  hairline: '#ECEAE3',
  ink: '#1B1A18',
  muted: '#6B6A64',
  faint: '#A6A49C',
  signal: '#3E7B27',        // deep green: readable as text on white and as a fill
  signalDim: 'rgba(62,123,39,0.12)',
  onSignal: '#FFFFFF',
  ember: '#C2610C',
  emberDim: 'rgba(194,97,12,0.12)',
  danger: '#C2361E',
  dangerDim: 'rgba(194,54,30,0.10)',
  overlay: 'rgba(20,18,14,0.55)',
  amber: '#3E7B27',
  amberSoft: 'rgba(62,123,39,0.12)',
  green: '#3E7B27',
  greenSoft: 'rgba(62,123,39,0.12)',
  red: '#C2361E',
  redSoft: 'rgba(194,54,30,0.10)',
};

// Default palette for module-scope code and non-themed screens (the camera).
export const C: Palette = DARK;

export const F = {
  display: 'Archivo_800ExtraBold',
  heading: 'Archivo_700Bold',
  headingItalic: 'Archivo_600SemiBold_Italic',
  mono: 'IBMPlexMono_600SemiBold',
  monoLight: 'IBMPlexMono_500Medium',
};

export const radius = { card: 6, tile: 4, pill: 999, button: 8 };

export const shadow = {
  soft: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  glow: {
    shadowColor: '#C8FA3C',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
};

// Tiny uppercase label. Its colour is a mid-grey that reads on both themes, so
// `...label` spreads never need per-theme overrides.
export const label = {
  fontFamily: F.mono,
  fontSize: 10.5,
  letterSpacing: 1.6,
  textTransform: 'uppercase' as const,
  color: '#8B8A93',
};
