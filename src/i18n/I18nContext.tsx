import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { AppLocale, TFunction } from './types';
import { createTranslate, normalizeLocale } from './createTranslate';

type I18nContextValue = {
	locale: AppLocale;
	setLocale: (locale: AppLocale) => void;
	t: TFunction;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
	const [locale, setLocale] = useState<AppLocale>('en');
	const t = useMemo(() => createTranslate(locale), [locale]);
	const value = useMemo(() => ({ locale, setLocale, t }), [locale, t]);
	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
	const ctx = useContext(I18nContext);
	if (!ctx) {
		throw new Error('useI18n must be used within I18nProvider');
	}
	return ctx;
}

/** 供极少数无法在 Provider 内的场景（测试等） */
export function useI18nOptional(): I18nContextValue | null {
	return useContext(I18nContext);
}

export { normalizeLocale };
