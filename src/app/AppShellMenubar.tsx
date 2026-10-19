import { memo, useState, type RefObject } from 'react';
import { BrandLogo } from '../BrandLogo';
import { AboutDialog } from '../AboutDialog';
import { MenubarFileMenu } from '../MenubarFileMenu';
import { MenubarWindowMenu } from '../MenubarWindowMenu';
import { quickOpenPrimaryShortcutLabel, saveShortcutLabel } from '../quickOpenPalette';
import { IconChevron, IconSearch, IconSettings } from '../icons';
import { AlbionAccountMenu } from '../AlbionAccountMenu';
import type { TFunction } from '../i18n';
import type { MenubarMenuId } from '../hooks/useMenubarMenuReducer';
import type { ShellLayoutMode } from './shellLayoutStorage';

export type AppShellMenubarProps = {
	layoutMode: ShellLayoutMode;
	hasAgentLayout: boolean;
	hasEditorLayout: boolean;
	t: TFunction;
	shell: Window['asyncShell'] | undefined;
	workspace: string | null;
	folderRecents: string[];
	activeTabId: string | null;
	windowMaximized: boolean;
	fileMenuRef: RefObject<HTMLDivElement | null>;
	editMenuRef: RefObject<HTMLDivElement | null>;
	viewMenuRef: RefObject<HTMLDivElement | null>;
	windowMenuRef: RefObject<HTMLDivElement | null>;
	terminalMenuRef: RefObject<HTMLDivElement | null>;
	helpMenuRef: RefObject<HTMLDivElement | null>;
	fileMenuOpen: boolean;
	editMenuOpen: boolean;
	viewMenuOpen: boolean;
	windowMenuOpen: boolean;
	terminalMenuOpen: boolean;
	helpMenuOpen: boolean;
	handleToggleFileMenu: () => void;
	handleToggleEditMenu: () => void;
	setMenubarMenu: (menu: MenubarMenuId, open: boolean) => void;
	toggleMenubarMenu: (menu: MenubarMenuId) => void;
	fileMenuNewFile: () => void | Promise<void>;
	fileMenuNewWindow: () => void | Promise<void>;
	fileMenuNewEditorWindow: () => void | Promise<void>;
	fileMenuOpenFile: () => void | Promise<void>;
	fileMenuOpenFolder: () => void | Promise<void>;
	openWorkspaceByPath: (path: string) => void | Promise<void | boolean>;
	onSaveFile: () => void | Promise<void>;
	fileMenuSaveAs: () => void | Promise<void>;
	fileMenuRevertFile: () => void | Promise<void>;
	fileMenuCloseEditor: () => void;
	closeWorkspaceFolder: () => void | Promise<void>;
	fileMenuQuit: () => void | Promise<void>;
	canEditUndoRedo: boolean;
	canEditCut: boolean;
	canEditCopy: boolean;
	canEditPaste: boolean;
	canEditSelectAll: boolean;
	executeEditAction: (action: 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll') => void | Promise<void>;
	toggleSidebarVisibility: () => void;
	canToggleTerminal: boolean;
	toggleTerminalVisibility: () => void;
	canToggleDiffPanel: boolean;
	toggleDiffPanelVisibility: () => void;
	openQuickOpen: (seed: string) => void;
	canGoPrevThread: boolean;
	goToPreviousThread: () => void | Promise<void>;
	canGoNextThread: boolean;
	goToNextThread: () => void | Promise<void>;
	canGoBackThread: boolean;
	goThreadBack: () => void | Promise<void>;
	canGoForwardThread: boolean;
	goThreadForward: () => void | Promise<void>;
	zoomInUi: () => void;
	zoomOutUi: () => void;
	resetUiZoom: () => void;
	toggleFullscreen: () => void | Promise<void>;
	windowMenuMinimize: () => void | Promise<void>;
	windowMenuToggleMaximize: () => void | Promise<void>;
	windowMenuCloseWindow: () => void | Promise<void>;
	spawnEditorTerminal: () => void;
	onReturnToAgentLayout: () => void;
	onEnterEditorLayout: () => void;
	handleOpenSettingsGeneral: () => void;
	handleOpenAutoUpdate: () => void;
};

/**
 * 顶栏独立 memo：流式输出等高频更新通常不改变菜单相关 props，可跳过整块 menubar 的 reconciliation。
 */
export const AppShellMenubar = memo(function AppShellMenubar({
	layoutMode,
	hasAgentLayout,
	hasEditorLayout,
	t,
	shell,
	workspace,
	folderRecents,
	activeTabId,
	windowMaximized,
	fileMenuRef,
	editMenuRef,
	viewMenuRef,
	windowMenuRef,
	terminalMenuRef,
	helpMenuRef,
	fileMenuOpen,
	editMenuOpen,
	viewMenuOpen,
	windowMenuOpen,
	terminalMenuOpen,
	helpMenuOpen,
	handleToggleFileMenu,
	handleToggleEditMenu,
	setMenubarMenu,
	toggleMenubarMenu,
	fileMenuNewFile,
	fileMenuNewWindow,
	fileMenuNewEditorWindow,
	fileMenuOpenFile,
	fileMenuOpenFolder,
	openWorkspaceByPath,
	onSaveFile,
	fileMenuSaveAs,
	fileMenuRevertFile,
	fileMenuCloseEditor,
	closeWorkspaceFolder,
	fileMenuQuit,
	canEditUndoRedo,
	canEditCut,
	canEditCopy,
	canEditPaste,
	canEditSelectAll,
	executeEditAction,
	toggleSidebarVisibility,
	canToggleTerminal,
	toggleTerminalVisibility,
	canToggleDiffPanel,
	toggleDiffPanelVisibility,
	openQuickOpen,
	canGoPrevThread,
	goToPreviousThread,
	canGoNextThread,
	goToNextThread,
	canGoBackThread,
	goThreadBack,
	canGoForwardThread,
	goThreadForward,
	zoomInUi,
	zoomOutUi,
	resetUiZoom,
	toggleFullscreen,
	windowMenuMinimize,
	windowMenuToggleMaximize,
	windowMenuCloseWindow,
	spawnEditorTerminal,
	onReturnToAgentLayout,
	onEnterEditorLayout,
	handleOpenSettingsGeneral,
	handleOpenAutoUpdate,
}: AppShellMenubarProps) {
	const [aboutOpen, setAboutOpen] = useState(false);
	const agentLayoutLabel = hasAgentLayout ? t('app.openAgentLayout') : t('app.createAgentLayout');
	const agentLayoutAriaLabel = hasAgentLayout ? t('app.openAgentLayoutAria') : t('app.createAgentLayoutAria');
	const editorLayoutLabel = hasEditorLayout ? t('app.openEditorLayout') : t('app.createEditorLayout');
	const editorLayoutAriaLabel = hasEditorLayout
		? t('app.openEditorLayoutAria')
		: t('app.createEditorLayoutAria');
	return (
		<header className={`ref-menubar ${layoutMode === 'agent' ? 'ref-menubar--agent' : ''}`}>
			<div className="ref-menubar-left">
				<div className="ref-brand-block-simple">
					<BrandLogo className="ref-brand-logo" size={22} />
				</div>
				<nav className="ref-menu-nav" aria-label={t('app.menu')}>
					<div className="ref-menu-dropdown-wrap" ref={fileMenuRef}>
						<button
							type="button"
							className={`ref-menu-item${fileMenuOpen ? ' is-active' : ''}`}
							aria-expanded={fileMenuOpen}
							aria-haspopup="menu"
							onClick={handleToggleFileMenu}
						>
							{t('app.menuFile')}
						</button>
						{fileMenuOpen ? (
							<MenubarFileMenu
								onClose={() => setMenubarMenu('file', false)}
								isDesktopShell={!!shell}
								hasWorkspace={!!workspace}
								folderRecents={folderRecents}
								canSave={false}
								canEditorClose={!!activeTabId}
								canCloseFolder={!!shell && !!workspace}
								shortcutSave={saveShortcutLabel()}
								onNewFile={() => void fileMenuNewFile()}
								onNewWindow={() => void fileMenuNewWindow()}
								onNewEditorWindow={() => void fileMenuNewEditorWindow()}
								onOpenFile={() => void fileMenuOpenFile()}
								onOpenFolder={() => void fileMenuOpenFolder()}
								onOpenRecentPath={(p) => void openWorkspaceByPath(p)}
								onSave={() => void onSaveFile()}
								onSaveAs={() => void fileMenuSaveAs()}
								onRevert={() => void fileMenuRevertFile()}
								onCloseEditor={() => fileMenuCloseEditor()}
								onCloseFolder={() => void closeWorkspaceFolder()}
								onQuit={() => void fileMenuQuit()}
							/>
						) : null}
					</div>
					<div className="ref-menu-dropdown-wrap" ref={editMenuRef}>
						<button
							type="button"
							className={`ref-menu-item${editMenuOpen ? ' is-active' : ''}`}
							aria-expanded={editMenuOpen}
							aria-haspopup="menu"
							onMouseDown={(e) => e.preventDefault()}
							onClick={handleToggleEditMenu}
						>
							{t('app.menuEdit')}
						</button>
						{editMenuOpen ? (
							<div className="ref-menu-dropdown" role="menu" aria-label={t('app.menuEdit')}>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canEditUndoRedo}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										void executeEditAction('undo');
										setMenubarMenu('edit', false);
									}}
								>
									<span>{t('app.edit.undo')}</span>
									<kbd className="ref-menu-kbd">Ctrl+Z</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canEditUndoRedo}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										void executeEditAction('redo');
										setMenubarMenu('edit', false);
									}}
								>
									<span>{t('app.edit.redo')}</span>
									<kbd className="ref-menu-kbd">Ctrl+Shift+Z</kbd>
								</button>
								<div className="ref-menu-dropdown-sep" role="separator" />
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canEditCut}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										void executeEditAction('cut');
										setMenubarMenu('edit', false);
									}}
								>
									<span>{t('app.edit.cut')}</span>
									<kbd className="ref-menu-kbd">Ctrl+X</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canEditCopy}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										void executeEditAction('copy');
										setMenubarMenu('edit', false);
									}}
								>
									<span>{t('app.edit.copy')}</span>
									<kbd className="ref-menu-kbd">Ctrl+C</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canEditPaste}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										void executeEditAction('paste');
										setMenubarMenu('edit', false);
									}}
								>
									<span>{t('app.edit.paste')}</span>
									<kbd className="ref-menu-kbd">Ctrl+V</kbd>
								</button>
								<div className="ref-menu-dropdown-sep" role="separator" />
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canEditSelectAll}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => {
										void executeEditAction('selectAll');
										setMenubarMenu('edit', false);
									}}
								>
									<span>{t('app.edit.selectAll')}</span>
									<kbd className="ref-menu-kbd">Ctrl+A</kbd>
								</button>
							</div>
						) : null}
					</div>
					<div className="ref-menu-dropdown-wrap" ref={viewMenuRef}>
						<button
							type="button"
							className={`ref-menu-item${viewMenuOpen ? ' is-active' : ''}`}
							aria-expanded={viewMenuOpen}
							aria-haspopup="menu"
							onClick={() => {
								toggleMenubarMenu('view');
							}}
						>
							{t('app.menuView')}
						</button>
						{viewMenuOpen ? (
							<div className="ref-menu-dropdown" role="menu" aria-label={t('app.menuView')}>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									onClick={() => {
										toggleSidebarVisibility();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.toggleSidebar')}</span>
									<kbd className="ref-menu-kbd">Ctrl+B</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canToggleTerminal}
									onClick={() => {
										toggleTerminalVisibility();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.toggleTerminal')}</span>
									<kbd className="ref-menu-kbd">Ctrl+`</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canToggleDiffPanel}
									onClick={() => {
										toggleDiffPanelVisibility();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.toggleDiffPanel')}</span>
									<kbd className="ref-menu-kbd">Alt+Ctrl+B</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									onClick={() => {
										openQuickOpen('');
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.find')}</span>
									<kbd className="ref-menu-kbd">Ctrl+F</kbd>
								</button>
								<div className="ref-menu-dropdown-sep" role="separator" />
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canGoPrevThread}
									onClick={() => {
										void goToPreviousThread();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.previousThread')}</span>
									<kbd className="ref-menu-kbd">Ctrl+Shift+[</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canGoNextThread}
									onClick={() => {
										void goToNextThread();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.nextThread')}</span>
									<kbd className="ref-menu-kbd">Ctrl+Shift+]</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canGoBackThread}
									onClick={() => {
										void goThreadBack();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.back')}</span>
									<kbd className="ref-menu-kbd">Ctrl+[</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									disabled={!canGoForwardThread}
									onClick={() => {
										void goThreadForward();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.forward')}</span>
									<kbd className="ref-menu-kbd">Ctrl+]</kbd>
								</button>
								<div className="ref-menu-dropdown-sep" role="separator" />
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									onClick={() => {
										zoomInUi();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.zoomIn')}</span>
									<kbd className="ref-menu-kbd">Ctrl++</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									onClick={() => {
										zoomOutUi();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.zoomOut')}</span>
									<kbd className="ref-menu-kbd">Ctrl+-</kbd>
								</button>
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									onClick={() => {
										resetUiZoom();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.actualSize')}</span>
									<kbd className="ref-menu-kbd">Ctrl+0</kbd>
								</button>
								<div className="ref-menu-dropdown-sep" role="separator" />
								<button
									type="button"
									role="menuitem"
									className="ref-menu-dropdown-item ref-menu-dropdown-item--row"
									onClick={() => {
										void toggleFullscreen();
										setMenubarMenu('view', false);
									}}
								>
									<span>{t('app.view.toggleFullscreen')}</span>
								</button>
							</div>
						) : null}
					</div>
					<div className="ref-menu-dropdown-wrap" ref={windowMenuRef}>
						<button
							type="button"
							className={`ref-menu-item${windowMenuOpen ? ' is-active' : ''}`}
							aria-expanded={windowMenuOpen}
							aria-haspopup="menu"
							onClick={() => {
								toggleMenubarMenu('window');
							}}
						>
							{t('app.menuWindow')}
						</button>
						{windowMenuOpen ? (
							<MenubarWindowMenu
								onClose={() => setMenubarMenu('window', false)}
								isDesktopShell={!!shell}
								windowMaximized={windowMaximized}
								onNewWindow={() => void fileMenuNewWindow()}
								onMinimize={() => void windowMenuMinimize()}
								onToggleMaximize={() => void windowMenuToggleMaximize()}
								onCloseWindow={() => void windowMenuCloseWindow()}
							/>
						) : null}
					</div>
					<div className="ref-menu-dropdown-wrap" ref={helpMenuRef}>
						<button
							type="button"
							className={`ref-menu-item${helpMenuOpen ? ' is-active' : ''}`}
							aria-expanded={helpMenuOpen}
							aria-haspopup="menu"
							onClick={() => {
								toggleMenubarMenu('help');
							}}
						>
							{t('app.menuHelp')}
						</button>
						{helpMenuOpen ? (
							<HelpMenuDropdown
								t={t}
								shell={shell}
								onClose={() => setMenubarMenu('help', false)}
								onOpenAutoUpdate={() => {
									setMenubarMenu('help', false);
									handleOpenAutoUpdate();
								}}
								onOpenAbout={() => {
									setMenubarMenu('help', false);
									setAboutOpen(true);
								}}
							/>
						) : null}
					</div>
					{layoutMode === 'editor' && workspace ? (
						<div className="ref-menu-dropdown-wrap" ref={terminalMenuRef}>
							<button
								type="button"
								className={`ref-menu-item${terminalMenuOpen ? ' is-active' : ''}`}
								aria-expanded={terminalMenuOpen}
								aria-haspopup="menu"
								onClick={() => {
									toggleMenubarMenu('terminal');
								}}
							>
								{t('app.menuTerminal')}
								<IconChevron className="ref-menu-chevron" />
							</button>
							{terminalMenuOpen ? (
								<div className="ref-menu-dropdown" role="menu">
									<button
										type="button"
										role="menuitem"
										className="ref-menu-dropdown-item"
										onClick={() => spawnEditorTerminal()}
									>
										{t('app.menuNewTerminal')}
									</button>
								</div>
							) : null}
						</div>
					) : null}
				</nav>
			</div>
			<div className={`ref-menubar-center ${layoutMode === 'agent' ? 'ref-menubar-center--hidden' : ''}`}>
				{layoutMode !== 'agent' ? (
					<button
						type="button"
						className="ref-global-search-btn"
						aria-label={t('quickOpen.menubarAria')}
						title={t('quickOpen.placeholder')}
						onClick={() => openQuickOpen('')}
					>
						<IconSearch className="ref-global-search-icon" />
						<span className="ref-global-search-text">{t('quickOpen.menubarSummary')}</span>
						<kbd className="ref-global-search-kbd">{quickOpenPrimaryShortcutLabel()}</kbd>
					</button>
				) : null}
			</div>
			<div className="ref-menubar-right">
				{layoutMode === 'editor' ? (
					<button
						type="button"
						className="ref-menubar-layout-switch-btn"
						onClick={onReturnToAgentLayout}
						title={agentLayoutLabel}
						aria-label={agentLayoutAriaLabel}
					>
						{agentLayoutLabel}
					</button>
				) : (
					<button
						type="button"
						className="ref-menubar-layout-switch-btn"
						onClick={onEnterEditorLayout}
						title={editorLayoutLabel}
						aria-label={editorLayoutAriaLabel}
					>
						{editorLayoutLabel}
					</button>
				)}
				<button
					type="button"
					className="ref-icon-tile ref-settings-btn"
					onClick={handleOpenSettingsGeneral}
					title={t('app.settings')}
					aria-label={t('app.settingsAria')}
				>
					<IconSettings />
				</button>
				<AlbionAccountMenu />
			</div>
			<AboutDialog open={aboutOpen} t={t} shell={shell} onClose={() => setAboutOpen(false)} />
		</header>
	);
});

const HELP_DOC_URL = 'https://github.com/albion-dev/albion#readme';
const HELP_ISSUES_URL = 'https://github.com/albion-dev/albion/issues/new';
const HELP_RELEASES_URL = 'https://github.com/albion-dev/albion/releases';

type HelpMenuDropdownProps = {
	t: TFunction;
	shell: Window['asyncShell'] | undefined;
	onClose: () => void;
	onOpenAutoUpdate: () => void;
	onOpenAbout: () => void;
};

function HelpMenuDropdown({ t, shell, onClose, onOpenAutoUpdate, onOpenAbout }: HelpMenuDropdownProps) {
	const openExternal = (url: string) => {
		if (shell) {
			void shell.invoke('shell:openExternalUrl', url).catch(() => {});
		} else {
			window.open(url, '_blank', 'noopener,noreferrer');
		}
	};

	return (
		<div className="ref-menu-dropdown" role="menu" aria-label={t('app.menuHelp')}>
			<button
				type="button"
				role="menuitem"
				className="ref-menu-dropdown-item"
				onClick={() => { openExternal(HELP_DOC_URL); onClose(); }}
			>
				{t('app.help.documentation')}
			</button>
			<button
				type="button"
				role="menuitem"
				className="ref-menu-dropdown-item"
				onClick={() => { openExternal(HELP_RELEASES_URL); onClose(); }}
			>
				{t('app.help.releases')}
			</button>
			<button
				type="button"
				role="menuitem"
				className="ref-menu-dropdown-item"
				onClick={() => { openExternal(HELP_ISSUES_URL); onClose(); }}
			>
				{t('app.help.reportIssue')}
			</button>
			<div className="ref-menu-dropdown-sep" role="separator" />
			<button
				type="button"
				role="menuitem"
				className="ref-menu-dropdown-item"
				onClick={onOpenAutoUpdate}
			>
				{t('app.help.checkForUpdates')}
			</button>
			<div className="ref-menu-dropdown-sep" role="separator" />
			<button
				type="button"
				role="menuitem"
				className="ref-menu-dropdown-item"
				onClick={onOpenAbout}
			>
				{t('app.help.about')}
			</button>
		</div>
	);
}
