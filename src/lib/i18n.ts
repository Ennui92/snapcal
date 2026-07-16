// Tiny i18n: five dictionaries, `{var}` interpolation, language persisted in
// the meta table. Default is the device language when we speak it, else
// English. Screens read t() at render time; changing language bumps the
// store version so the whole tree re-renders.
import { getLocales } from 'expo-localization';
import de from '@/locales/de';
import el from '@/locales/el';
import en from '@/locales/en';
import es from '@/locales/es';
import fr from '@/locales/fr';
import { getMeta, setMeta } from './db';

export type Lang = 'en' | 'el' | 'de' | 'es' | 'fr';
export type TKey = keyof typeof en;

const DICTS: Record<Lang, Record<TKey, string>> = { en, el, de, es, fr };

// Shown in the picker, each language in its own words.
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'el', label: 'Ελληνικά' },
  { code: 'de', label: 'Deutsch' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
];

// English names, used to tell the AI which language to answer in.
export const LANG_NAME_EN: Record<Lang, string> = {
  en: 'English', el: 'Greek', de: 'German', es: 'Spanish', fr: 'French',
};

// BCP-47 tags for date and number formatting.
const LOCALE_TAG: Record<Lang, string> = {
  en: 'en-GB', el: 'el-GR', de: 'de-DE', es: 'es-ES', fr: 'fr-FR',
};

let current: Lang = 'en';

function deviceLang(): Lang {
  try {
    for (const l of getLocales()) {
      const code = l.languageCode;
      if (code && code in DICTS) return code as Lang;
    }
  } catch {
    // native module unavailable (e.g. tests) — fall through to English
  }
  return 'en';
}

// Call once after initDb().
export function initLanguage() {
  const saved = getMeta('language');
  current = saved && saved in DICTS ? (saved as Lang) : deviceLang();
}

export function getLanguage(): Lang {
  return current;
}

export function setLanguage(l: Lang) {
  current = l;
  setMeta('language', l);
}

export function localeTag(): string {
  return LOCALE_TAG[current];
}

export function t(key: TKey, vars?: Record<string, string | number>): string {
  let s = DICTS[current][key] ?? DICTS.en[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
