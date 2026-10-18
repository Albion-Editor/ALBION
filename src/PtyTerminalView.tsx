import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import { useI18n } from './i18n';
import { useDomTheme, readDomThemePreset } from './useDomColorScheme';
import { readDomColorScheme } from './colorMode';
import type { ThemePresetId } from './appearanceSettings';
import { dispatchTerminalHotkey } from './terminalWindow/terminalHotkeyDispatch';
import { installXtermHotkeyRouting } from './terminalWindow/terminalHotkeyXtermInstall';
import { showTerminalCopiedNotice } from './terminalWindow/terminalNoticeToast';
import {
	loadTerminalSettings,
	mergeResolvedTerminalHotkeysMap,
	subscribeTerminalSettings,
	type TerminalAppSettings,
} from './terminalWindow/terminalSettings';
import {
	isTerminalAlternateScreen,
	prepareTerminalPasteText,
} from './terminalWindow/terminalRuntime';

type XTermThemeColors = {
	background: string;
	foreground: string;
	cursor: string;
	cursorAccent?: string;
	selectionBackground: string;
	black: string;
	brightBlack: string;
	red?: string;
	brightRed?: string;
	green?: string;
	brightGreen?: string;
	yellow?: string;
	brightYellow?: string;
	blue?: string;
	brightBlue?: string;
	magenta?: string;
	brightMagenta?: string;
	cyan?: string;
	brightCyan?: string;
	white?: string;
	brightWhite?: string;
};

export type PtyTerminalViewProps = {
	sessionId: string;
	/** 多标签时仅当前标签参与 fit / pty resize */
	active: boolean;
	compactChrome?: boolean;
	/** shell 退出时（pty 已由主进程关闭） */
	onSessionExit?: () => void;
};

/**
 * 与主进程 node-pty 会话绑定的 xterm；输入直接进伪终端（VS Code 式交互 shell）。
 * 快捷键由 terminalSettings.hotkeys 配置。
 */
export function PtyTerminalView({ sessionId, active, compactChrome, onSessionExit }: PtyTerminalViewProps) {
	const { t } = useI18n();
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<XTerm | null>(null);
	const fitRef = useRef<FitAddon | null>(null);
	const activeRef = useRef(active);
	const onExitRef = useRef(onSessionExit);
	const settingsRef = useRef<TerminalAppSettings>(loadTerminalSettings());
	const zoomLevelRef = useRef(0);
	const searchAddonRef = useRef<SearchAddon | null>(null);
	const findInputRef = useRef<HTMLInputElement | null>(null);
	const { scheme, preset, themeBg } = useDomTheme();
	const [settings, setSettings] = useState<TerminalAppSettings>(() => loadTerminalSettings());
	const [themeColors, setThemeColors] = useState<XTermThemeColors>(() =>
		resolveThemeColors(readDomThemePreset(), readDomColorScheme())
	);
	const [searchUi, setSearchUi] = useState<{ open: boolean; query: string }>({ open: false, query: '' });
	activeRef.current = active;
	onExitRef.current = onSessionExit;
	settingsRef.current = settings;

	useEffect(() => {
		return subscribeTerminalSettings(() => {
			setSettings(loadTerminalSettings());
		});
	}, []);

	useEffect(() => {
		const nextColors = resolveThemeColors(preset, scheme);
		setThemeColors(nextColors);

		// Synchronize CSS custom properties globally for all terminal wrappers, tabs, and viewports
		if (typeof document !== 'undefined' && document.documentElement) {
			document.documentElement.style.setProperty('--terminal-bg', nextColors.background);
			document.documentElement.style.setProperty('--terminal-fg', nextColors.foreground);
			document.documentElement.style.setProperty('--terminal-accent', nextColors.cursor);
		}

		const term = termRef.current;
		if (term) {
			term.options.theme = {
				...nextColors,
			};
			if (typeof (term as unknown as { setOption: (key: string, val: unknown) => void }).setOption === 'function') {
				try {
					(term as unknown as { setOption: (key: string, val: unknown) => void }).setOption('theme', nextColors);
				} catch {
					/* ignore */
				}
			}
			if (containerRef.current) {
				containerRef.current.style.backgroundColor = nextColors.background;
				const innerVp = containerRef.current.querySelector('.xterm-viewport') as HTMLElement | null;
				if (innerVp) {
					innerVp.style.backgroundColor = nextColors.background;
				}
				const xtermScreen = containerRef.current.querySelector('.xterm-screen') as HTMLElement | null;
				if (xtermScreen) {
					xtermScreen.style.backgroundColor = nextColors.background;
				}
			}
			try {
				term.refresh(0, term.rows - 1);
			} catch {
				/* ignore */
			}
		}
	}, [scheme, preset, themeBg]);

	useEffect(() => {
		const shell = window.asyncShell;
		const el = containerRef.current;
		if (!shell?.subscribeTerminalSessionData || !el) {
			return;
		}
		const current = settingsRef.current;
		const term = new XTerm({
			theme: {
				...themeColors,
			},
			fontSize: current.fontSize,
			fontFamily: current.fontFamily,
			fontWeight: current.fontWeight,
			fontWeightBold: current.fontWeightBold,
			lineHeight: current.lineHeight,
			cursorBlink: current.cursorBlink,
			cursorStyle: current.cursorStyle,
			scrollback: current.scrollback,
			minimumContrastRatio: current.minimumContrastRatio,
			drawBoldTextInBrightColors: current.drawBoldTextInBrightColors,
			scrollOnUserInput: current.scrollOnInput,
			wordSeparator: current.wordSeparator,
			ignoreBracketedPasteMode: !current.bracketedPaste,
			allowProposedApi: true,
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(el);
		termRef.current = term;
		fitRef.current = fit;

		const confirmMultilinePaste = async (preview: string) =>
			window.confirm(`${t('app.universalTerminalPasteMultipleLines')}\n\n${preview.slice(0, 1000)}`);

		const pasteText = async (text: string): Promise<boolean> => {
			const next = await prepareTerminalPasteText(
				text,
				settingsRef.current,
				isTerminalAlternateScreen(term),
				confirmMultilinePaste
			);
			if (!next) {
				return false;
			}
			term.paste(next);
			return true;
		};

		const pasteFromClipboard = async (): Promise<boolean> => {
			try {
				const raw = await shell.invoke('clipboard:readText');
				const text = typeof raw === 'string' ? raw : '';
				if (!text) {
					return false;
				}
				return pasteText(text);
			} catch {
				return false;
			}
		};

		const copySelection = async (): Promise<boolean> => {
			const selection = term.getSelection();
			if (!selection) {
				return false;
			}
			try {
				await shell.invoke('clipboard:writeText', selection);
				return true;
			} catch {
				return false;
			}
		};

		const propagateResize = () => {
			if (!activeRef.current || !fitRef.current || !containerRef.current) {
				return;
			}
			try {
				fitRef.current.fit();
				const dims = fitRef.current.proposeDimensions();
				if (dims) {
					void shell.invoke('term:sessionResize', sessionId, dims.cols, dims.rows);
				}
			} catch {
				/* ignore */
			}
		};

		const applyZoomFontSize = () => {
			const base = settingsRef.current.fontSize;
			const scale = Math.pow(1.1, zoomLevelRef.current);
			term.options.fontSize = base * scale;
			try {
				term.refresh(0, term.rows - 1);
			} catch {
				/* ignore */
			}
			propagateResize();
		};

		const searchAddon = new SearchAddon({ highlightLimit: 500 });
		term.loadAddon(searchAddon);
		searchAddonRef.current = searchAddon;

		const disposeHotkeys = installXtermHotkeyRouting(
			term,
			() => mergeResolvedTerminalHotkeysMap(settingsRef.current),
			(hotkeyId) => {
				void dispatchTerminalHotkey(hotkeyId, {
					term,
					write: async (data) => {
						await shell.invoke('term:sessionWrite', sessionId, data);
					},
					copySelection,
					pasteFromClipboard,
					selectAll: () => term.selectAll(),
					clear: () => term.clear(),
					getCwd: () => '',
					writeClipboardText: async (text) => {
						await shell.invoke('clipboard:writeText', text);
					},
					showCopiedNotice: () => showTerminalCopiedNotice(t('app.universalTerminalToast.copied')),
					zoom: {
						levelRef: zoomLevelRef,
						applyFontSize: () => applyZoomFontSize(),
					},
					search: {
						addon: searchAddon,
						open: () => {
							const selected = term.getSelection().trim();
							setSearchUi({ open: true, query: selected });
						},
					},
				});
			}
		);

		let cancelled = false;
		let seenSeq = 0;
		void shell
			.invoke('term:sessionSubscribe', sessionId)
			.then((raw) => {
				const sub = raw as { ok?: boolean; slice?: { content?: string; seq?: number; alive?: boolean } };
				if (cancelled || !sub.ok || !sub.slice) {
					return;
				}
				seenSeq = typeof sub.slice.seq === 'number' ? sub.slice.seq : 0;
				if (sub.slice.content) {
					term.write(sub.slice.content);
				}
				if (sub.slice.alive === false) {
					onExitRef.current?.();
				}
			})
			.catch(() => {
				/* ignore */
			});

		const unsubData = shell.subscribeTerminalSessionData((id, data, seq) => {
			if (id !== sessionId) {
				return;
			}
			if (seq && seq <= seenSeq) {
				return;
			}
			seenSeq = seq || seenSeq + 1;
			term.write(data);
		});
		const unsubExit =
			shell.subscribeTerminalSessionExit?.((id) => {
				if (id === sessionId) {
					onExitRef.current?.();
				}
			}) ?? (() => {});

		const onDataDisposer = term.onData((data) => {
			void shell.invoke('term:sessionWrite', sessionId, data);
		});

		const selectionDisposer = term.onSelectionChange(() => {
			if (!settingsRef.current.copyOnSelect || !term.hasSelection()) {
				return;
			}
			const selected = term.getSelection();
			if (selected) {
				void shell.invoke('clipboard:writeText', selected).catch(() => {
					/* ignore */
				});
			}
		});

		const bellDisposer = term.onBell(() => {
			if (settingsRef.current.bell !== 'visual') {
				return;
			}
			el.classList.add('pty-term-root--bell');
			window.setTimeout(() => el.classList.remove('pty-term-root--bell'), 160);
		});

		const onContextMenu = (event: MouseEvent) => {
			const action = settingsRef.current.rightClickAction;
			if (action === 'off') {
				return;
			}
			event.preventDefault();
			if (action === 'clipboard' && term.hasSelection()) {
				const selected = term.getSelection();
				if (selected) {
					void shell.invoke('clipboard:writeText', selected).catch(() => {
						/* ignore */
					});
				}
				return;
			}
			void shell
				.invoke('clipboard:readText')
				.then((raw) => {
					const text = typeof raw === 'string' ? raw : '';
					if (text) {
						term.paste(text);
					}
				})
				.catch(() => {
					/* ignore */
				});
		};
		el.addEventListener('contextmenu', onContextMenu);

		const ro = new ResizeObserver(() => {
			propagateResize();
		});
		ro.observe(el);

		return () => {
			disposeHotkeys();
			searchAddonRef.current = null;
			ro.disconnect();
			onDataDisposer.dispose();
			selectionDisposer.dispose();
			bellDisposer.dispose();
			el.removeEventListener('contextmenu', onContextMenu);
			cancelled = true;
			void shell.invoke('term:sessionUnsubscribe', sessionId).catch(() => {
				/* ignore */
			});
			unsubData();
			unsubExit();
			term.dispose();
			termRef.current = null;
			fitRef.current = null;
		};
	}, [sessionId, t]);

	useEffect(() => {
		zoomLevelRef.current = 0;
	}, [settings.fontSize]);

	useEffect(() => {
		const term = termRef.current;
		if (!term) {
			return;
		}
		term.options.fontSize = settings.fontSize * Math.pow(1.1, zoomLevelRef.current);
		term.options.fontFamily = settings.fontFamily;
		term.options.fontWeight = settings.fontWeight;
		term.options.fontWeightBold = settings.fontWeightBold;
		term.options.lineHeight = settings.lineHeight;
		term.options.cursorBlink = settings.cursorBlink;
		term.options.cursorStyle = settings.cursorStyle;
		term.options.scrollback = settings.scrollback;
		term.options.minimumContrastRatio = settings.minimumContrastRatio;
		term.options.drawBoldTextInBrightColors = settings.drawBoldTextInBrightColors;
		term.options.scrollOnUserInput = settings.scrollOnInput;
		term.options.wordSeparator = settings.wordSeparator;
		term.options.ignoreBracketedPasteMode = !settings.bracketedPaste;
		try {
			term.refresh(0, term.rows - 1);
		} catch {
			/* ignore */
		}
	}, [settings]);

	useEffect(() => {
		const term = termRef.current;
		if (!term) {
			return;
		}
		term.options.theme = {
			...themeColors,
		};
		try {
			term.refresh(0, term.rows - 1);
		} catch {
			/* ignore */
		}
	}, [themeColors]);

	useEffect(() => {
		if (!active) {
			return;
		}
		const term = termRef.current;
		const fit = fitRef.current;
		const shell = window.asyncShell;
		if (!term || !fit || !shell) {
			return;
		}
		const runFitAndRefresh = () => {
			try {
				fit.fit();
				const dims = fit.proposeDimensions();
				if (dims) {
					void shell.invoke('term:sessionResize', sessionId, dims.cols, dims.rows);
				}
				term.refresh(0, term.rows - 1);
				term.focus();
			} catch {
				/* ignore */
			}
		};
		const id = requestAnimationFrame(runFitAndRefresh);
		const timer = setTimeout(runFitAndRefresh, 60);
		return () => {
			cancelAnimationFrame(id);
			clearTimeout(timer);
		};
	}, [active, sessionId]);

	useEffect(() => {
		if (!searchUi.open || !active) {
			return;
		}
		const term = termRef.current;
		const addon = searchAddonRef.current;
		if (!term || !addon) {
			return;
		}
		const id = requestAnimationFrame(() => {
			findInputRef.current?.focus();
			findInputRef.current?.select();
			const q = searchUi.query;
			if (q) {
				addon.findNext(q, {
					caseSensitive: false,
					decorations: {
						matchOverviewRuler: '#888888',
						activeMatchColorOverviewRuler: '#ffff00',
						matchBackground: '#888888',
						activeMatchBackground: '#ffff00',
					},
				});
			}
		});
		return () => cancelAnimationFrame(id);
	}, [searchUi.open, searchUi.query, active]);

	const closeFind = useCallback(() => {
		searchAddonRef.current?.clearDecorations();
		setSearchUi({ open: false, query: '' });
		termRef.current?.focus();
	}, []);

	const onFindNext = useCallback(() => {
		const addon = searchAddonRef.current;
		if (!addon) {
			return;
		}
		const q = findInputRef.current?.value ?? searchUi.query;
		addon.findNext(q, {
			caseSensitive: false,
			decorations: {
				matchOverviewRuler: '#888888',
				activeMatchColorOverviewRuler: '#ffff00',
				matchBackground: '#888888',
				activeMatchBackground: '#ffff00',
			},
		});
	}, [searchUi.query]);

	const onFindPrevious = useCallback(() => {
		const addon = searchAddonRef.current;
		if (!addon) {
			return;
		}
		const q = findInputRef.current?.value ?? searchUi.query;
		addon.findPrevious(q, {
			caseSensitive: false,
			decorations: {
				matchOverviewRuler: '#888888',
				activeMatchColorOverviewRuler: '#ffff00',
				matchBackground: '#888888',
				activeMatchBackground: '#ffff00',
			},
		});
	}, [searchUi.query]);

	return (
		<div className={`pty-term-root${compactChrome ? ' pty-term-root--embedded' : ''}`}>
			<div className="ref-uterm-tab-term-wrap">
				{searchUi.open && active ? (
					<div className="ref-uterm-findbar" role="search">
						<input
							ref={findInputRef}
							className="ref-uterm-findbar-input"
							type="search"
							value={searchUi.query}
							placeholder={t('app.universalTerminalFind.placeholder')}
							aria-label={t('app.universalTerminalFind.placeholder')}
							onChange={(event) => setSearchUi((prev) => ({ ...prev, query: event.target.value }))}
							onKeyDown={(event) => {
								if (event.key === 'Enter') {
									event.preventDefault();
									if (event.shiftKey) {
										onFindPrevious();
									} else {
										onFindNext();
									}
								}
								if (event.key === 'Escape') {
									event.preventDefault();
									closeFind();
								}
							}}
						/>
						<button type="button" className="ref-uterm-findbar-btn" onClick={onFindPrevious}>
							{t('app.universalTerminalFind.prev')}
						</button>
						<button type="button" className="ref-uterm-findbar-btn" onClick={onFindNext}>
							{t('app.universalTerminalFind.next')}
						</button>
						<button type="button" className="ref-uterm-findbar-btn ref-uterm-findbar-btn--close" onClick={closeFind}>
							{t('app.universalTerminalFind.close')}
						</button>
					</div>
				) : null}
				<div ref={containerRef} className="xterm-viewport" />
			</div>
		</div>
	);
}

function getLiveComputedBg(fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const val =
		document.documentElement.style.getPropertyValue('--void-bg-0') ||
		getComputedStyle(document.documentElement).getPropertyValue('--void-bg-0');
	return (val ? val.trim() : '') || fallback;
}

function getLiveComputedFg(fallback: string): string {
	if (typeof document === 'undefined') return fallback;
	const val =
		document.documentElement.style.getPropertyValue('--void-fg-0') ||
		getComputedStyle(document.documentElement).getPropertyValue('--void-fg-0');
	return (val ? val.trim() : '') || fallback;
}

function resolveThemeColors(preset: ThemePresetId, scheme: 'light' | 'dark'): XTermThemeColors {
	if (scheme === 'light') {
		const bg = getLiveComputedBg('#FFFFFF');
		const fg = getLiveComputedFg('#1E293B');
		return {
			background: bg,
			foreground: fg,
			cursor: '#F59E0B', // Gold accent
			cursorAccent: bg,
			selectionBackground: 'rgba(59, 130, 246, 0.25)',
			black: fg,
			brightBlack: '#64748B',
			red: '#DC2626',
			brightRed: '#EF4444',
			green: '#16A34A',
			brightGreen: '#22C55E',
			yellow: '#D97706',
			brightYellow: '#F59E0B',
			blue: '#2563EB',
			brightBlue: '#3B82F6',
			magenta: '#9333EA',
			brightMagenta: '#A855F7',
			cyan: '#0891B2',
			brightCyan: '#06B6D4',
			white: '#F8FAFC',
			brightWhite: '#FFFFFF',
		};
	}

	switch (preset) {
		case 'cursor':
			return {
				background: getLiveComputedBg('#121820'),
				foreground: getLiveComputedFg('#E6EDF3'),
				cursor: '#38BDF8',
				cursorAccent: '#121820',
				selectionBackground: 'rgba(56, 189, 248, 0.3)',
				black: '#121820',
				brightBlack: '#484F58',
				red: '#F85149',
				brightRed: '#FF7B72',
				green: '#3FB950',
				brightGreen: '#56D364',
				yellow: '#D29922',
				brightYellow: '#E3B341',
				blue: '#38BDF8',
				brightBlue: '#79C0FF',
				magenta: '#BC8CFF',
				brightMagenta: '#D2A8FF',
				cyan: '#39C5CF',
				brightCyan: '#56D4DD',
				white: '#E6EDF3',
				brightWhite: '#F0F6FC',
			};

		case 'graphite':
			return {
				background: getLiveComputedBg('#161A20'),
				foreground: getLiveComputedFg('#F5F7FA'),
				cursor: '#7AA2FF',
				cursorAccent: '#161A20',
				selectionBackground: 'rgba(122, 162, 255, 0.28)',
				black: '#161A20',
				brightBlack: '#4B5563',
				red: '#EF4444',
				brightRed: '#F87171',
				green: '#10B981',
				brightGreen: '#34D399',
				yellow: '#FBBF24',
				brightYellow: '#FDE047',
				blue: '#7AA2FF',
				brightBlue: '#93C5FD',
				magenta: '#C084FC',
				brightMagenta: '#E879F9',
				cyan: '#38BDF8',
				brightCyan: '#67E8F9',
				white: '#E5E7EB',
				brightWhite: '#F9FAFB',
			};

		case 'forest':
			return {
				background: getLiveComputedBg('#111915'),
				foreground: getLiveComputedFg('#EEF8F1'),
				cursor: '#56C987',
				cursorAccent: '#111915',
				selectionBackground: 'rgba(86, 201, 135, 0.28)',
				black: '#111915',
				brightBlack: '#374B3F',
				red: '#E06C75',
				brightRed: '#F87171',
				green: '#56C987',
				brightGreen: '#86EFAC',
				yellow: '#E5C07B',
				brightYellow: '#FDE047',
				blue: '#4ADE80',
				brightBlue: '#6EE7B7',
				magenta: '#C678DD',
				brightMagenta: '#D8B4FE',
				cyan: '#56B6C2',
				brightCyan: '#A7F3D0',
				white: '#EEF8F1',
				brightWhite: '#F0FDF4',
			};

		case 'sunset':
			return {
				background: getLiveComputedBg('#1A1513'),
				foreground: getLiveComputedFg('#FFF4EE'),
				cursor: '#FF9D5C',
				cursorAccent: '#1A1513',
				selectionBackground: 'rgba(255, 157, 92, 0.28)',
				black: '#1A1513',
				brightBlack: '#44352D',
				red: '#F87171',
				brightRed: '#FCA5A5',
				green: '#34D399',
				brightGreen: '#6EE7B7',
				yellow: '#FBBF24',
				brightYellow: '#FDE68A',
				blue: '#FF9D5C',
				brightBlue: '#FDBA74',
				magenta: '#FB7185',
				brightMagenta: '#FDA4AF',
				cyan: '#F97316',
				brightCyan: '#FB923C',
				white: '#FFF4EE',
				brightWhite: '#FFFFFF',
			};

		case 'async':
		default:
			// Albion Theme
			return {
				background: getLiveComputedBg('#0F172A'),
				foreground: getLiveComputedFg('#E2E8F0'),
				cursor: '#F59E0B', // Gold accent
				cursorAccent: '#0F172A',
				selectionBackground: 'rgba(59, 130, 246, 0.3)',
				black: '#0F172A',
				brightBlack: '#475569',
				red: '#EF4444',
				brightRed: '#F87171',
				green: '#10B981',
				brightGreen: '#34D399',
				yellow: '#F59E0B',
				brightYellow: '#FBBF24',
				blue: '#3B82F6',
				brightBlue: '#60A5FA',
				magenta: '#EC4899',
				brightMagenta: '#F472B6',
				cyan: '#06B6D4',
				brightCyan: '#22D3EE',
				white: '#E2E8F0',
				brightWhite: '#FFFFFF',
			};
	}
}
