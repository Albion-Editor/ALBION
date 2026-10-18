import { useEffect, useState } from 'react';
import { readDomColorScheme, type EffectiveColorScheme } from './colorMode';
import type { ThemePresetId } from './appearanceSettings';

export function readDomThemePreset(): ThemePresetId {
	if (typeof document === 'undefined') {
		return 'async';
	}
	const attr = document.documentElement.getAttribute('data-theme-preset');
	if (attr === 'cursor' || attr === 'graphite' || attr === 'forest' || attr === 'sunset') {
		return attr;
	}
	return 'async';
}

export function useDomColorScheme(): EffectiveColorScheme {
	const [scheme, setScheme] = useState<EffectiveColorScheme>(() => readDomColorScheme());

	useEffect(() => {
		if (typeof document === 'undefined') {
			return;
		}
		const sync = () => {
			setScheme((current) => {
				const next = readDomColorScheme();
				return current === next ? current : next;
			});
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-color-scheme'],
		});
		return () => observer.disconnect();
	}, []);

	return scheme;
}

export function readDomThemeBg(): string {
	if (typeof document === 'undefined') {
		return '#0F172A';
	}
	return (
		document.documentElement.style.getPropertyValue('--void-bg-0') ||
		getComputedStyle(document.documentElement).getPropertyValue('--void-bg-0') ||
		'#0F172A'
	).trim();
}

export function useDomTheme(): { scheme: EffectiveColorScheme; preset: ThemePresetId; themeBg: string } {
	const [themeState, setThemeState] = useState(() => ({
		scheme: readDomColorScheme(),
		preset: readDomThemePreset(),
		themeBg: readDomThemeBg(),
	}));

	useEffect(() => {
		if (typeof document === 'undefined') {
			return;
		}
		const sync = () => {
			setThemeState((current) => {
				const nextScheme = readDomColorScheme();
				const nextPreset = readDomThemePreset();
				const nextBg = readDomThemeBg();
				if (current.scheme === nextScheme && current.preset === nextPreset && current.themeBg === nextBg) {
					return current;
				}
				return { scheme: nextScheme, preset: nextPreset, themeBg: nextBg };
			});
		};
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ['data-color-scheme', 'data-theme-preset', 'style'],
		});
		return () => observer.disconnect();
	}, []);

	return themeState;
}

