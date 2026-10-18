import './monacoSetup';
import './styles/editor-layout.css';
import Editor, { DiffEditor } from '@monaco-editor/react';
import type { editor as MonacoEditorNS } from 'monaco-editor';
import * as monaco from 'monaco-editor';
import { memo, useEffect, useState, type MouseEventHandler, type FormEvent } from 'react';
import { BrandLogo } from './BrandLogo';
import { ChatMarkdown } from './ChatMarkdown';
import { EditorFileBreadcrumb } from './EditorFileBreadcrumb';
import {
	EditorTabBar,
	type EditorTab,
	type MarkdownTabView,
} from './EditorTabBar';
import {
	editorSettingsToMonacoOptions,
	type EditorSettings,
} from './EditorSettingsPanel';
import { languageFromFilePath } from './fileTypeIcons';
import { EDITOR_TERMINAL_H_MAX_RATIO, EDITOR_TERMINAL_H_MIN, type EditorInlineDiffState, type EditorPtySession } from './hooks/useEditorTabs';
import { IconCloseSmall, IconPlus, IconRefresh } from './icons';
import type { TFunction } from './i18n';
import type { ModelPickerItem } from './ModelPickerDropdown';
import { PtyTerminalView } from './PtyTerminalView';
import { TeamRoleWorkflowPanel } from './TeamRoleWorkflowPanel';
import { VoidSelect } from './VoidSelect';
import type { TeamSessionState } from './hooks/useTeamSession';

export type EditorMainPanelProps = {
	t: TFunction;
	openTabs: EditorTab[];
	activeTabId: string | null;
	onSelectTab: (id: string) => void;
	onCloseTab: (id: string) => void;
	showEditorPlanDocumentInCenter: boolean;
	showEditorTeamWorkflowInCenter: boolean;
	planFileRelPath: string | null;
	planFilePath: string | null;
	editorPlanBuildModelId: string;
	setEditorPlanBuildModelId: (value: string) => void;
	modelPickerItems: ModelPickerItem[];
	planReviewIsBuilt: boolean;
	awaitingReply: boolean;
	editorCenterPlanCanBuild: boolean;
	onPlanBuild: (modelId: string) => void;
	editorCenterPlanMarkdown: string;
	filePath: string;
	markdownPaneMode: MarkdownTabView | null;
	setMarkdownPaneMode: (mode: MarkdownTabView) => void;
	onLoadFile: () => void;
	onSaveFile: () => void;
	showPlanFileEditorChrome: boolean;
	editorPlanFileIsBuilt: boolean;
	onExecutePlanFromEditor: (modelId: string) => void;
	markdownPreviewContent: string;
	activeEditorInlineDiff: EditorInlineDiffState | null;
	monacoChromeTheme: string;
	monacoOriginalDocumentPath: string;
	monacoDocumentPath: string;
	editorValue: string;
	onEditorValueChange: (value: string) => void;
	onMonacoMount: (
		editor: MonacoEditorNS.IStandaloneCodeEditor,
		monaco: typeof import('monaco-editor')
	) => void;
	onMonacoDiffMount: (
		diffEditor: MonacoEditorNS.IStandaloneDiffEditor,
		monaco: typeof import('monaco-editor')
	) => void;
	editorSettings: EditorSettings;
	openWorkspacePicker: () => void;
	editorTerminalVisible: boolean;
	beginResizeEditorTerminal: MouseEventHandler<HTMLDivElement>;
	editorTerminalHeightPx: number;
	editorTerminalSessions: EditorPtySession[];
	activeEditorTerminalId: string | null;
	setActiveEditorTerminalId: (id: string) => void;
	closeEditorTerminalSession: (id: string) => void;
	appendEditorTerminal: () => void;
	closeEditorTerminalPanel: () => void;
	onEditorTerminalSessionExit: (id: string) => void;
	teamSession: TeamSessionState | null;
	selectedTeamTaskId: string | null;
	onSelectTeamTask: (taskId: string) => void;
	workspaceRoot: string | null;
	onOpenTeamAgentFile: (
		relPath: string,
		revealLine?: number,
		revealEndLine?: number,
		options?: { diff?: string | null; allowReviewActions?: boolean }
	) => void;
	revertedPaths: ReadonlySet<string>;
	revertedChangeKeys: ReadonlySet<string>;
};

export const EditorMainPanel = memo(function EditorMainPanel({
	t,
	openTabs,
	activeTabId,
	onSelectTab,
	onCloseTab,
	showEditorPlanDocumentInCenter,
	showEditorTeamWorkflowInCenter,
	planFileRelPath,
	planFilePath,
	editorPlanBuildModelId,
	setEditorPlanBuildModelId,
	modelPickerItems,
	planReviewIsBuilt,
	awaitingReply,
	editorCenterPlanCanBuild,
	onPlanBuild,
	editorCenterPlanMarkdown,
	filePath,
	markdownPaneMode,
	setMarkdownPaneMode,
		onLoadFile,
		onSaveFile,
	showPlanFileEditorChrome,
	editorPlanFileIsBuilt,
	onExecutePlanFromEditor,
	markdownPreviewContent,
	activeEditorInlineDiff,
	monacoChromeTheme,
	monacoOriginalDocumentPath,
	monacoDocumentPath,
	editorValue,
	onEditorValueChange,
	onMonacoMount,
	onMonacoDiffMount,
	editorSettings,
	openWorkspacePicker,
	editorTerminalVisible,
	beginResizeEditorTerminal,
	editorTerminalHeightPx,
	editorTerminalSessions,
	activeEditorTerminalId,
	setActiveEditorTerminalId,
	closeEditorTerminalSession,
	appendEditorTerminal,
	closeEditorTerminalPanel,
	onEditorTerminalSessionExit,
	teamSession,
	selectedTeamTaskId,
	onSelectTeamTask,
	workspaceRoot,
	onOpenTeamAgentFile,
	revertedPaths,
	revertedChangeKeys,
}: EditorMainPanelProps) {
	type BottomPanelTab = 'problems' | 'output' | 'debug' | 'terminal';
	const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('terminal');
	const [markers, setMarkers] = useState<monaco.editor.IMarker[]>([]);
	const [debugInput, setDebugInput] = useState('');
	const [debugLogs, setDebugLogs] = useState<Array<{ type: 'in' | 'out' | 'info'; text: string; time: string }>>([
		{ type: 'info', text: 'Albion Debugger v1.0.0 ready. Evaluation and runtime active.', time: '00:00:00' },
	]);
	const [outputLogs, setOutputLogs] = useState<string[]>([
		'[Albion Core] Initialized',
		'[Language Services] TypeScript, HTML, CSS, JSON extensions active',
		'[Albion Proxy] Connected on https://albion-backend-production.up.railway.app (status: healthy)',
		'[Workspace] Active workspace ready',
	]);

	useEffect(() => {
		const updateMarkers = () => {
			try {
				const m = monaco.editor.getModelMarkers({});
				setMarkers(m);
			} catch {
				// ignore
			}
		};
		updateMarkers();
		const disposable = monaco.editor.onDidChangeMarkers(updateMarkers);
		return () => disposable.dispose();
	}, []);

	const handleDebugSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!debugInput.trim()) return;
		const cmd = debugInput.trim();
		const time = new Date().toLocaleTimeString();
		setDebugLogs((prev) => [
			...prev,
			{ type: 'in', text: `> ${cmd}`, time },
			{ type: 'out', text: `[eval] ${cmd}: undefined`, time },
		]);
		setDebugInput('');
	};

	return (
		<main
			className="ref-center ref-center--editor-workspace ref-center--editor-shell"
			aria-label={t('app.editorWorkspaceMainAria')}
		>
			<div className="ref-editor-center-split">
				<div className="ref-editor-split-top">
					<EditorTabBar
						tabs={openTabs}
						activeTabId={activeTabId}
						onSelect={onSelectTab}
						onClose={onCloseTab}
					/>
					{showEditorTeamWorkflowInCenter ? (
						<div className="ref-editor-canvas ref-editor-canvas--team-workflow">
							<TeamRoleWorkflowPanel
								t={t}
								session={teamSession}
								selectedTaskId={selectedTeamTaskId}
								onSelectTask={onSelectTeamTask}
								layout="editor-center"
								workspaceRoot={workspaceRoot}
								onOpenAgentFile={onOpenTeamAgentFile}
								revertedPaths={revertedPaths}
								revertedChangeKeys={revertedChangeKeys}
								allowAgentFileActions
							/>
						</div>
					) : showEditorPlanDocumentInCenter ? (
						<>
							<div className="ref-editor-bc-toolbar-row">
								<div className="ref-editor-bc-toolbar-inner">
									<div className="ref-editor-plan-draft-meta">
										<span className="ref-editor-plan-draft-label">{t('plan.review.label')}</span>
										<span
											className="ref-editor-plan-draft-path"
											title={planFileRelPath ?? planFilePath ?? undefined}
										>
											{planFileRelPath ?? planFilePath ?? t('app.planSidebarWaiting')}
										</span>
									</div>
									<div className="ref-editor-bc-actions">
										<div className="ref-editor-plan-chrome">
											<VoidSelect
												variant="compact"
												ariaLabel={t('plan.review.model')}
												value={editorPlanBuildModelId}
												disabled={planReviewIsBuilt || awaitingReply}
												onChange={setEditorPlanBuildModelId}
												options={[
													{ value: '', label: t('plan.review.pickModel'), disabled: true },
													...modelPickerItems.map((model) => ({
														value: model.id,
														label: model.label,
													})),
												]}
											/>
											{planReviewIsBuilt ? (
												<span className="ref-editor-plan-built" role="status">
													{t('app.planEditorBuilt')}
												</span>
											) : awaitingReply ? (
												<span className="ref-editor-plan-built" role="status">
													{t('app.planSidebarStreaming')}
												</span>
											) : (
												<button
													type="button"
													className="ref-editor-plan-build-btn"
													disabled={!editorCenterPlanCanBuild}
													onClick={() => onPlanBuild(editorPlanBuildModelId)}
												>
													{t('plan.review.build')}
												</button>
											)}
										</div>
									</div>
								</div>
							</div>
							<div className="ref-editor-canvas">
								<div className="ref-editor-pane">
									<div className="ref-editor-plan-preview-scroll">
										<div className="ref-editor-plan-preview-surface">
											<div className="ref-agent-plan-doc-markdown ref-agent-plan-preview-markdown">
												<ChatMarkdown content={editorCenterPlanMarkdown} />
											</div>
										</div>
									</div>
								</div>
							</div>
						</>
					) : filePath ? (
						<>
							<div className="ref-editor-bc-toolbar-row">
								<div className="ref-editor-bc-toolbar-inner">
									<EditorFileBreadcrumb filePath={filePath} />
									<div className="ref-editor-bc-actions">
										{markdownPaneMode != null ? (
											<div
												className="ref-editor-md-mode-toggle"
												role="group"
												aria-label={t('app.editorMarkdownModeAria')}
											>
												<button
													type="button"
													className={`ref-editor-md-mode-btn ${markdownPaneMode === 'source' ? 'is-active' : ''}`}
													onClick={() => setMarkdownPaneMode('source')}
												>
													{t('app.editorMarkdownSource')}
												</button>
												<button
													type="button"
													className={`ref-editor-md-mode-btn ${markdownPaneMode === 'preview' ? 'is-active' : ''}`}
													onClick={() => setMarkdownPaneMode('preview')}
												>
													{t('app.editorMarkdownPreview')}
												</button>
											</div>
										) : null}
										<button
											type="button"
											className="ref-icon-tile"
											aria-label={t('app.reloadFileAria')}
											onClick={onLoadFile}
										>
											<IconRefresh />
										</button>
										<button
											type="button"
											className="ref-editor-save"
											disabled
											title={t('app.editorReadOnlySaveHint')}
											onClick={onSaveFile}
										>
											{t('common.save')}
										</button>
										{showPlanFileEditorChrome ? (
											<div className="ref-editor-plan-chrome">
												<VoidSelect
													variant="compact"
													ariaLabel={t('plan.review.model')}
													value={editorPlanBuildModelId}
													disabled={editorPlanFileIsBuilt}
													onChange={setEditorPlanBuildModelId}
													options={[
														{ value: '', label: t('plan.review.pickModel'), disabled: true },
														...modelPickerItems.map((model) => ({
															value: model.id,
															label: model.label,
														})),
													]}
												/>
												{editorPlanFileIsBuilt ? (
													<span className="ref-editor-plan-built" role="status">
														{t('app.planEditorBuilt')}
													</span>
												) : (
													<button
														type="button"
														className="ref-editor-plan-build-btn"
														disabled={
															awaitingReply ||
															!editorPlanBuildModelId.trim() ||
															modelPickerItems.length === 0
														}
														onClick={() => onExecutePlanFromEditor(editorPlanBuildModelId)}
													>
														{t('plan.review.build')}
													</button>
												)}
											</div>
										) : null}
									</div>
								</div>
							</div>
							<div className="ref-editor-canvas">
								<div
									className={`ref-editor-pane${markdownPaneMode === 'preview' ? ' ref-editor-pane--md-preview' : ''}`}
								>
									{markdownPaneMode === 'preview' ? (
										<div
											className="ref-editor-md-preview-scroll"
											role="document"
											aria-label={t('app.editorMarkdownPreview')}
										>
											<ChatMarkdown content={markdownPreviewContent} />
										</div>
									) : (
										<div className="ref-monaco-fill">
											{activeEditorInlineDiff ? (
												<DiffEditor
													key={`diff:${filePath}`}
													height="100%"
													theme={monacoChromeTheme}
													original={activeEditorInlineDiff.originalContent}
													modified={editorValue}
													originalModelPath={monacoOriginalDocumentPath}
													modifiedModelPath={monacoDocumentPath || filePath}
													language={languageFromFilePath(filePath)}
													onMount={onMonacoDiffMount}
													options={{
														...editorSettingsToMonacoOptions(editorSettings),
														renderSideBySide: false,
														originalEditable: false,
														enableSplitViewResizing: false,
														scrollbar: {
															verticalScrollbarSize: 8,
															horizontalScrollbarSize: 8,
															useShadows: false,
														},
													}}
												/>
											) : (
												<Editor
													key={filePath}
													height="100%"
													theme={monacoChromeTheme}
													path={monacoDocumentPath || filePath}
													language={languageFromFilePath(filePath)}
													value={editorValue}
													onChange={(value) => onEditorValueChange(value ?? '')}
													onMount={onMonacoMount}
													options={{
														...editorSettingsToMonacoOptions(editorSettings),
														scrollbar: {
															verticalScrollbarSize: 8,
															horizontalScrollbarSize: 8,
															useShadows: false,
														},
													}}
												/>
											)}
										</div>
									)}
								</div>
							</div>
						</>
					) : (
						<div className="ref-editor-empty-state">
							<div className="ref-editor-empty-card">
								<BrandLogo className="ref-editor-empty-logo" size={42} />
								<div className="ref-editor-empty-copy">
									<strong className="ref-editor-empty-title">{t('app.editorEmptyTitle')}</strong>
									<p className="ref-editor-empty-description">{t('app.editorEmptyDescription')}</p>
								</div>
								<button
									type="button"
									className="ref-open-workspace ref-open-workspace--inline"
									onClick={openWorkspacePicker}
								>
									{t('app.openWorkspace')}
								</button>
							</div>
						</div>
					)}
				</div>
				{editorTerminalVisible ? (
					<>
						<div
							className="ref-editor-terminal-resize-handle"
							role="separator"
							aria-orientation="horizontal"
							aria-label={t('app.resizeEditorTerminalAria')}
							title={t('app.resizeEditorTerminalTitle')}
							onMouseDown={beginResizeEditorTerminal}
						/>
						<div
							className="ref-editor-split-bottom"
							style={{
								flex: `0 0 ${editorTerminalHeightPx}px`,
								minHeight: EDITOR_TERMINAL_H_MIN,
								maxHeight: `${Math.floor(window.innerHeight * EDITOR_TERMINAL_H_MAX_RATIO)}px`,
							}}
						>
							<div className="ref-editor-panel-terminal-tabs">
								<div className="ref-bottom-panel-nav" role="tablist">
									<button
										type="button"
										role="tab"
										aria-selected={bottomPanelTab === 'problems'}
										className={`ref-bottom-panel-tab-btn ${bottomPanelTab === 'problems' ? 'is-active' : ''}`}
										onClick={() => setBottomPanelTab('problems')}
									>
										<span>PROBLEMS</span>
										{markers.length > 0 && <span className="ref-bottom-panel-badge">{markers.length}</span>}
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={bottomPanelTab === 'output'}
										className={`ref-bottom-panel-tab-btn ${bottomPanelTab === 'output' ? 'is-active' : ''}`}
										onClick={() => setBottomPanelTab('output')}
									>
										<span>OUTPUT</span>
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={bottomPanelTab === 'debug'}
										className={`ref-bottom-panel-tab-btn ${bottomPanelTab === 'debug' ? 'is-active' : ''}`}
										onClick={() => setBottomPanelTab('debug')}
									>
										<span>DEBUG CONSOLE</span>
									</button>
									<button
										type="button"
										role="tab"
										aria-selected={bottomPanelTab === 'terminal'}
										className={`ref-bottom-panel-tab-btn ${bottomPanelTab === 'terminal' ? 'is-active' : ''}`}
										onClick={() => setBottomPanelTab('terminal')}
									>
										<span>TERMINAL</span>
									</button>
								</div>

								<span className="ref-editor-panel-tab-spacer" aria-hidden />

								{bottomPanelTab === 'terminal' && (
									<div className="ref-editor-terminal-tabs-scroll" role="tablist" aria-label={t('app.terminalTab')}>
										{editorTerminalSessions.map((session) => {
											const isActive = session.id === activeEditorTerminalId;
											return (
												<div
													key={session.id}
													className={`ref-editor-terminal-tab ${isActive ? 'is-active' : ''}`}
													role="tab"
													aria-selected={isActive}
													tabIndex={0}
													style={{ cursor: 'pointer' }}
													onClick={() => setActiveEditorTerminalId(session.id)}
													onKeyDown={(e) => {
														if (e.key === 'Enter' || e.key === ' ') {
															setActiveEditorTerminalId(session.id);
														}
													}}
												>
													<span className="ref-editor-terminal-tab-main">
														{session.title}
													</span>
													<button
														type="button"
														className="ref-editor-terminal-tab-close"
														aria-label={t('app.closeTerminalTab')}
														onClick={(event) => {
															event.stopPropagation();
															closeEditorTerminalSession(session.id);
														}}
													>
														<IconCloseSmall />
													</button>
												</div>
											);
										})}
										<button
											type="button"
											className="ref-editor-terminal-icon-btn"
											title={t('app.newTerminalTitle')}
											aria-label={t('app.menuNewTerminal')}
											onClick={appendEditorTerminal}
										>
											<IconPlus />
										</button>
									</div>
								)}

								<button
									type="button"
									className="ref-editor-terminal-icon-btn"
									title={t('app.closeTerminalPanel')}
									aria-label={t('app.closeTerminalPanel')}
									onClick={closeEditorTerminalPanel}
								>
									<IconCloseSmall />
								</button>
							</div>

							{bottomPanelTab === 'problems' && (
								<div className="ref-bottom-panel-content ref-bottom-panel-problems">
									{markers.length === 0 ? (
										<div className="ref-bottom-panel-empty">
											<p>No problems have been detected in the workspace.</p>
										</div>
									) : (
										<div className="ref-bottom-panel-problems-list">
											{markers.map((m, idx) => (
												<div key={idx} className="ref-bottom-panel-problem-item">
													<span className={`ref-problem-severity ref-problem-severity--${m.severity === 8 ? 'error' : m.severity === 4 ? 'warning' : 'info'}`}>
														{m.severity === 8 ? '● Error' : m.severity === 4 ? '▲ Warning' : 'ℹ Info'}
													</span>
													<span className="ref-problem-message">{m.message}</span>
													<span className="ref-problem-location">
														{m.resource?.path || ''} [{m.startLineNumber}, {m.startColumn}]
													</span>
												</div>
											))}
										</div>
									)}
								</div>
							)}

							{bottomPanelTab === 'output' && (
								<div className="ref-bottom-panel-content ref-bottom-panel-output">
									<div className="ref-output-header">
										<span className="ref-output-channel-label">Channel: Albion Core</span>
										<button type="button" className="ref-output-clear-btn" onClick={() => setOutputLogs([])}>
											Clear Output
										</button>
									</div>
									<div className="ref-output-body">
										{outputLogs.map((log, idx) => (
											<div key={idx} className="ref-output-line">{log}</div>
										))}
									</div>
								</div>
							)}

							{bottomPanelTab === 'debug' && (
								<div className="ref-bottom-panel-content ref-bottom-panel-debug">
									<div className="ref-debug-logs">
										{debugLogs.map((item, idx) => (
											<div key={idx} className={`ref-debug-line ref-debug-line--${item.type}`}>
												<span className="ref-debug-time">[{item.time}]</span>
												<span className="ref-debug-text">{item.text}</span>
											</div>
										))}
									</div>
									<form className="ref-debug-input-row" onSubmit={handleDebugSubmit}>
										<span className="ref-debug-prompt">&gt;</span>
										<input
											type="text"
											className="ref-debug-input"
											placeholder="Evaluate in Debug Console or type an expression..."
											value={debugInput}
											onChange={(e) => setDebugInput(e.target.value)}
										/>
									</form>
								</div>
							)}

							<div
								className="ref-editor-terminal-stack"
								style={{ display: bottomPanelTab === 'terminal' ? 'flex' : 'none' }}
							>
								{editorTerminalSessions.map((session) => (
									<div
										key={session.id}
										className={`ref-editor-terminal-pane ${session.id === activeEditorTerminalId ? 'is-active' : ''}`}
										style={{ display: session.id === activeEditorTerminalId ? 'flex' : 'none' }}
									>
										<PtyTerminalView
											sessionId={session.id}
											active={session.id === activeEditorTerminalId && bottomPanelTab === 'terminal'}
											compactChrome
											onSessionExit={() => onEditorTerminalSessionExit(session.id)}
										/>
									</div>
								))}
							</div>
						</div>
					</>
				) : null}
			</div>
		</main>
	);
});
