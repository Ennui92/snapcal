// Active-theme plumbing. Screens call useColors() for the live palette and
// build styles with makeStyles(C); useThemeMode() drives the settings toggle.
// The choice persists in the meta table. 'system' follows the OS.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance } from 'react-native';
import { DARK, LIGHT, type Palette } from '@/constants/theme';
import { getMeta, setMeta } from '@/lib/db';

export type ThemeMode = 'dark' | 'light' | 'system';

type Ctx = {
  colors: Palette;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (m: ThemeMode) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

function resolve(mode: ThemeMode): boolean {
  if (mode === 'system') return Appearance.getColorScheme() !== 'light';
  return mode === 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const saved = getMeta('theme') as ThemeMode | null;
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'dark';
  });
  const [systemDark, setSystemDark] = useState(Appearance.getColorScheme() !== 'light');

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => setSystemDark(colorScheme !== 'light'));
    return () => sub.remove();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    setMeta('theme', m);
  }, []);

  const isDark = mode === 'system' ? systemDark : mode === 'dark';

  const value = useMemo<Ctx>(() => ({
    colors: isDark ? DARK : LIGHT,
    mode,
    isDark,
    setMode,
  }), [isDark, mode, setMode]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** The live palette. Use as `const C = useColors()` then `makeStyles(C)`. */
export function useColors(): Palette {
  const ctx = useContext(ThemeCtx);
  return ctx ? ctx.colors : DARK;
}

export function useThemeMode(): { mode: ThemeMode; isDark: boolean; setMode: (m: ThemeMode) => void } {
  const ctx = useContext(ThemeCtx);
  if (!ctx) return { mode: 'dark', isDark: true, setMode: () => {} };
  return { mode: ctx.mode, isDark: ctx.isDark, setMode: ctx.setMode };
}
