// SnapCal design system: "Darkroom".
//
// The app is a camera, so it lives where cameras live: in the dark. Near-black
// surfaces, one acid signal colour, monospaced numerals like a light-meter
// readout, and hairline rules instead of floating pastel cards. Nothing is
// soft, nothing is cute, everything is legible at arm's length over a plate.
//
// Semantic names are kept stable (amber/green/red) so screens keep compiling,
// but they now point at the dark palette. Prefer the explicit names below
// (signal / ember / danger / surface) in new code.
export const C = {
  // surfaces, darkest to lightest
  bg: '#08080A',
  card: '#131317',
  raised: '#1C1C21',
  border: '#26262D',
  hairline: '#1E1E24',

  // text
  ink: '#F7F7F4',
  muted: '#9695A0',
  faint: '#5C5B66',

  // the one accent: acid lime. On track, primary actions, live data.
  signal: '#C8FA3C',
  signalDim: 'rgba(200,250,60,0.14)',
  onSignal: '#0A0A0B',

  // states
  ember: '#FF8A1F',
  emberDim: 'rgba(255,138,31,0.14)',
  danger: '#FF4438',
  dangerDim: 'rgba(255,68,56,0.14)',

  // legacy aliases, repointed
  amber: '#C8FA3C',
  amberSoft: 'rgba(200,250,60,0.14)',
  green: '#C8FA3C',
  greenSoft: 'rgba(200,250,60,0.14)',
  red: '#FF4438',
  redSoft: 'rgba(255,68,56,0.14)',
  overlay: 'rgba(4,4,6,0.72)',
};

export const F = {
  // display: tight, heavy grotesk. Used big or as tiny uppercase labels.
  display: 'Archivo_800ExtraBold',
  heading: 'Archivo_700Bold',
  headingItalic: 'Archivo_600SemiBold_Italic',
  // data: every number the user is judged by is monospaced, like a readout.
  mono: 'IBMPlexMono_600SemiBold',
  monoLight: 'IBMPlexMono_500Medium',
};

// Corners are tight. Rounded-everything is what makes an app look generic.
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

// Tiny uppercase label, letterspaced. The workhorse of the whole UI.
export const label = {
  fontFamily: F.mono,
  fontSize: 10.5,
  letterSpacing: 1.6,
  textTransform: 'uppercase' as const,
  color: C.muted,
};
