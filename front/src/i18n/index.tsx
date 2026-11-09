import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Preferences } from '@pippos/shared';
import { en } from './en';
import { es } from './es';

export type Language = Preferences['language'];
export type MessageKey = keyof typeof es;

const CATALOGOS: Record<Language, Record<MessageKey, string>> = { es, en };

export function isLanguage(valor: unknown): valor is Language {
  return valor === 'es' || valor === 'en';
}

export function t(key: MessageKey, lang: Language): string {
  return CATALOGOS[lang][key];
}

export { en, es };

interface I18n {
  lang: Language;
  t: (key: MessageKey) => string;
  setLang: (lang: Language) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  lang,
  onChange,
  children,
}: {
  lang: Language;
  onChange: (lang: Language) => void;
  children: ReactNode;
}) {
  const valor = useMemo<I18n>(() => ({ lang, t: (key) => t(key, lang), setLang: onChange }), [lang, onChange]);
  return <I18nContext value={valor}>{children}</I18nContext>;
}

export function useI18n(): I18n {
  const valor = useContext(I18nContext);
  if (valor === null) throw new Error('useI18n necesita I18nProvider');
  return valor;
}
