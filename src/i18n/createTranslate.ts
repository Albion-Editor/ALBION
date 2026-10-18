import type { AppLocale, TFunction, TParams } from './types';
import { messagesZhCN } from './messages.zh-CN';
import { messagesEn } from './messages.en';

export function interpolate(template: string, params?: TParams): string {
	if (!params) {
		return template;
	}
	return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
		const v = params[key];
		return v === undefined || v === null ? '' : String(v);
	});
}

export function createTranslate(locale: AppLocale): TFunction {
	const primary = locale === 'en' ? messagesEn : messagesZhCN;
	const secondary = locale === 'en' ? messagesZhCN : messagesEn;
	return (key: string, params?: TParams): string => {
		const raw = primary[key] ?? secondary[key] ?? key;
		return interpolate(raw, params);
	};
}

/** Fallback without Context (matches default language) */
export const defaultT = createTranslate('en');

export function normalizeLocale(raw: unknown): AppLocale {
	if (raw === 'zh-CN') {
		return 'zh-CN';
	}
	return 'en';
}
