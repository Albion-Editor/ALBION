import { app, BrowserWindow, nativeTheme } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { saveAlbionToken } from './llm/albionTransport.js';
import { initWindowsConsoleUtf8 } from './winUtf8.js';
import { initSettingsStore, getRestorableWorkspace, getSettings, getMcpServerConfigs } from './settingsStore.js';
import { ensureDefaultThread, flushPendingSave, initThreadStore } from './threadStore.js';
import { registerIpc } from './ipc/register.js';
import { initAgentSnapshotStore } from './agent/agentSnapshotStore.js';
import { agentRevertSnapshotsByThread } from './ipc/chatRuntime.js';
import { getMcpManager } from './mcp/index.js';
import { getEffectiveMcpServerConfigs } from './plugins/pluginRuntimeService.js';
import { configureAppWindowIcon, createAppWindow, getAppWindowSurfaceForWebContents } from './appWindow.js';
import {
	nativeWindowChromeFromAppearance,
	normalizeAppearanceSettings,
} from '../src/appearanceSettings.js';
import { initAutoUpdate } from './autoUpdate.js';
import { disposeBotController, initBotController, syncBotControllerFromSettings } from './bots/botController.js';
import { flushBotSessionStore, initBotSessionStore } from './bots/botSessionStore.js';
import { disposeAppTray, initAppTray } from './appTray.js';
import { disposeBrowserCaptureProxy } from './browser/browserMitmProxy.js';
import { SystemProxy as BrowserSystemProxy } from './browser/browserSystemProxy.js';
import { applyAiBrowserStartupSwitches } from './browser/aiBrowserFlag.js';
import {
	handleGoogleLoginWindowOpen,
	installGoogleLoginWebviewPolicy,
} from './browser/googleLoginPolicy.js';
import { disposePlaywrightBridge } from './browser/playwrightBridge.js';

initWindowsConsoleUtf8();

// Ensure single instance lock for deep linking and single window management
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
	console.log('[startup] Another instance is already running. Quitting second instance.');
	app.quit();
}

export function handleAlbionDeepLink(rawUrl: string): void {
	console.log('[DeepLink] Processing URL:', rawUrl);
	try {
		const parsed = new URL(rawUrl);
		const target = (parsed.hostname + parsed.pathname).toLowerCase();
		if (target.includes('auth')) {
			const token = parsed.searchParams.get('token') || parsed.searchParams.get('access_token');
			const userId = parsed.searchParams.get('userId') || parsed.searchParams.get('user_id');
			const email = parsed.searchParams.get('email');
			if (token) {
				const decodedToken = decodeURIComponent(token);
				let user = (userId || email) ? { id: userId || 'albion-user', email: email || 'user@albion.dev' } : undefined;
				if (!user) {
					try {
						const parts = decodedToken.split('.');
						if (parts.length === 3) {
							const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
							if (payload?.sub || payload?.email) {
								user = { id: payload.sub || 'albion-user', email: payload.email || 'user@albion.dev' };
							}
						}
					} catch {
						/* ignore jwt decode error */
					}
				}
				const finalUser = user || { id: 'albion-user', email: 'user@albion.dev' };
				saveAlbionToken(decodedToken, finalUser);
				console.log('[DeepLink] Saved session for:', finalUser.email);
				for (const win of BrowserWindow.getAllWindows()) {
					if (!win.isDestroyed()) {
						try {
							win.webContents.send('albion:auth:state-changed', {
								isAuthenticated: true,
								token: decodedToken,
								user: finalUser,
							});
						} catch {
							/* ignore destroyed window */
						}
					}
				}
			}
		}
	} catch (err) {
		console.error('[DeepLink] Error handling deep link:', err);
	}
}

export function findDeepLinkArg(argv: string[]): string | undefined {
	for (const raw of argv) {
		if (typeof raw !== 'string') continue;
		const clean = raw.trim().replace(/^["']|["']$/g, '');
		if (clean.startsWith('albion://')) {
			return clean;
		}
	}
	return undefined;
}

export function registerAlbionProtocolClient(): void {
	const protocol = 'albion';
	try {
		if (process.defaultApp) {
			if (process.argv.length >= 2) {
				app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
			}
		} else {
			app.setAsDefaultProtocolClient(protocol);
		}
		console.log(`[Protocol] Registered default protocol client for '${protocol}://'`);
	} catch (err) {
		console.warn('[Protocol] app.setAsDefaultProtocolClient error:', err);
	}

	if (process.platform === 'win32') {
		try {
			const isPackaged = app.isPackaged;
			let targetCmd: string;
			if (isPackaged) {
				targetCmd = `\\"${process.execPath}\\" \\"%1\\"`;
			} else {
				const unpackedExe = path.join(app.getAppPath(), 'release', 'win-unpacked', 'Albion.exe');
				if (existsSync(unpackedExe)) {
					targetCmd = `\\"${unpackedExe}\\" \\"%1\\"`;
				} else {
					targetCmd = `\\"${process.execPath}\\" \\"${path.resolve(app.getAppPath())}\\" \\"%1\\"`;
				}
			}
			const cmd = `reg.exe add "HKCU\\Software\\Classes\\albion" /ve /d "URL:Albion Protocol" /f && reg.exe add "HKCU\\Software\\Classes\\albion" /v "URL Protocol" /t REG_SZ /d "" /f && reg.exe add "HKCU\\Software\\Classes\\albion\\shell\\open\\command" /ve /d "${targetCmd}" /f`;
			exec(cmd, (err: unknown) => {
				if (err) {
					console.warn('[Protocol] Windows registry registration error:', err);
				} else {
					console.log('[Protocol] Windows HKCU protocol registry confirmed for:', targetCmd);
				}
			});
		} catch (e) {
			console.warn('[Protocol] Registry execution error:', e);
		}
	}
}

app.on('second-instance', (_event, argv) => {
	console.log('[second-instance] Invoked with argv:', argv);
	const [mainWin] = BrowserWindow.getAllWindows();
	if (mainWin) {
		if (mainWin.isMinimized()) mainWin.restore();
		if (!mainWin.isVisible()) mainWin.show();
		mainWin.focus();
	}
	const deepLinkUrl = findDeepLinkArg(argv);
	if (deepLinkUrl) {
		handleAlbionDeepLink(deepLinkUrl);
	}
});

app.on('open-url', (event, url) => {
	event.preventDefault();
	const [mainWin] = BrowserWindow.getAllWindows();
	if (mainWin) {
		if (mainWin.isMinimized()) mainWin.restore();
		if (!mainWin.isVisible()) mainWin.show();
		mainWin.focus();
	}
	handleAlbionDeepLink(url);
});

function resolveAppIconPath(): string | undefined {
	const iconSearchRoots =
		process.platform === 'darwin'
			? [
					process.resourcesPath,
					path.join(process.resourcesPath, 'resources', 'icons'),
					path.join(app.getAppPath(), 'resources', 'icons'),
				]
			: [path.join(app.getAppPath(), 'resources', 'icons')];
	const names =
		process.platform === 'win32'
			? ['icon.ico', 'icon.png']
			: process.platform === 'darwin'
				? ['icon.icns', 'icon.png']
				: ['icon.png'];
	for (const root of iconSearchRoots) {
		for (const name of names) {
			const full = path.join(root, name);
			if (existsSync(full)) {
				return full;
			}
		}
	}
	return undefined;
}

// 必须在 app.whenReady 之前调用 —— Chromium 命令行开关只在初始化前生效。
applyAiBrowserStartupSwitches();
installGoogleLoginWebviewPolicy();

// Intercept webview new-window requests and forward to host renderer
// (Electron 12+ deprecated the new-window event; use setWindowOpenHandler instead)
app.on('web-contents-created', (_event, contents) => {
	if (contents.getType() !== 'webview') {
		return;
	}
	contents.setWindowOpenHandler(({ url, disposition }) => {
		if (handleGoogleLoginWindowOpen(contents, url).handled) {
			return { action: 'deny' };
		}
		const host = contents.hostWebContents;
		if (host && !host.isDestroyed()) {
			host.send('async-shell:browserNewWindow', { url, disposition });
		}
		return { action: 'deny' };
	});
});

let quittingAfterThreadStoreFlush = false;
let forceQuitFromTray = false;
let appIsQuitting = false;

function requestAppQuit(): void {
	forceQuitFromTray = true;
	app.quit();
}

app.on('before-quit', (e) => {
	appIsQuitting = true;
	if (quittingAfterThreadStoreFlush) {
		return;
	}
	quittingAfterThreadStoreFlush = true;
	e.preventDefault();
	flushBotSessionStore();
	void Promise.allSettled([
		flushPendingSave(),
		disposeBotController(),
		disposeBrowserCaptureProxy(),
		disposePlaywrightBridge(),
		BrowserSystemProxy.hasSavedState() ? BrowserSystemProxy.disable() : Promise.resolve(),
	]).finally(() => {
		app.quit();
	});
});

app.on('browser-window-created', (_event, win) => {
	win.on('close', (event) => {
		if (getAppWindowSurfaceForWebContents(win.webContents) === 'browser') {
			return;
		}
		if (forceQuitFromTray || appIsQuitting || process.platform === 'darwin') {
			return;
		}
		event.preventDefault();
		win.hide();
	});
});

app.whenReady().then(() => {
	// Recover from a previous run that did not get to restore the system proxy.
	if (BrowserSystemProxy.hasSavedState()) {
		void BrowserSystemProxy.disable().catch(() => {
			/* best-effort restore */
		});
	}
	// 仅在显式 debug 开关下安装 React DevTools，保持 dev / dev:debug 语义与现有脚本一致。
	const installReactDevTools =
		process.env.ASYNC_SHELL_DEVTOOLS === '1' || process.env.VOID_SHELL_DEVTOOLS === '1';
	if (installReactDevTools) {
		const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');

		installExtension(REACT_DEVELOPER_TOOLS, { loadExtension: true })
			.then(() => console.log('✅ React DevTools 已安装'))
			.catch((err: unknown) => console.log('安装失败:', err));
	}

	const t0 = Date.now();
	const lap = (label: string) => console.log(`[startup] ${label}: +${Date.now() - t0}ms`);

	const appIconPath = resolveAppIconPath();
	configureAppWindowIcon(appIconPath);
	initAppTray(appIconPath, requestAppQuit);
	if (process.platform === 'darwin' && appIconPath) {
		try {
			app.dock?.setIcon(appIconPath);
		} catch (error) {
			console.warn('[startup] failed to set dock icon:', error);
		}
	}
	lap('icon configured');

	const userData = app.getPath('userData');
	initSettingsStore(userData);
	lap('settingsStore init');
	initBotSessionStore(userData);
	lap('botSessionStore init');
	initBotController(getSettings);
	void syncBotControllerFromSettings(getSettings());
	lap('botController init');

	const restored = getRestorableWorkspace();
	lap('restorableWorkspace resolved');

	const restoredUsable = restored && existsSync(restored) ? restored : null;
	initThreadStore(userData, restoredUsable);
	lap('threadStore init');

	ensureDefaultThread(restoredUsable);
	lap('defaultThread ensured');

	initAgentSnapshotStore(userData, agentRevertSnapshotsByThread);
	lap('agentSnapshotStore init');

	registerIpc();
	lap('IPC registered');

	// 自动启动已启用且 autoStart 的 MCP 服务器
	const mcpManager = getMcpManager();
	mcpManager.loadConfigs(getEffectiveMcpServerConfigs(getMcpServerConfigs(), restoredUsable));
	void mcpManager.startAll().then(() => {
		lap('MCP auto-start done');
	});

	const settings = getSettings();
	const ui = (settings.ui ?? {}) as Partial<Record<string, unknown>>;
	const colorMode =
		ui.colorMode === 'light' || ui.colorMode === 'dark' || ui.colorMode === 'system'
			? ui.colorMode
			: 'system';
	const scheme = colorMode === 'system' ? (nativeTheme.shouldUseDarkColors ? 'dark' : 'light') : colorMode;
	const appearance = normalizeAppearanceSettings(ui, scheme);
	const chromeOverride = nativeWindowChromeFromAppearance(appearance, scheme);

	createAppWindow({
		surface: 'agent',
		initialWorkspace: restoredUsable,
		initialThemeChrome: { scheme, override: chromeOverride },
	});
	lap('window created');

	// 初始化自动更新（获取刚创建的窗口）
	const [mainWin] = BrowserWindow.getAllWindows();
	if (mainWin) {
		initAutoUpdate(mainWin);
		lap('autoUpdate initialized');
	}

	registerAlbionProtocolClient();
	lap('protocol client registered');

	const startupDeepLink = findDeepLinkArg(process.argv);
	if (startupDeepLink) {
		console.log('[startup] Found startup deep link argument:', startupDeepLink);
		handleAlbionDeepLink(startupDeepLink);
	}

	app.on('activate', () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			const schemeNow = nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
			const appearanceNow = normalizeAppearanceSettings(ui, schemeNow);
			const chromeNow = nativeWindowChromeFromAppearance(appearanceNow, schemeNow);
			createAppWindow({
				surface: 'agent',
				initialThemeChrome: { scheme: schemeNow, override: chromeNow },
			});
		}
	});
});

app.on('window-all-closed', () => {
	if ((forceQuitFromTray || appIsQuitting) && process.platform !== 'darwin') {
		app.quit();
	}
});

app.on('will-quit', () => {
	disposeAppTray();
});
