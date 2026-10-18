import { startTransition, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import type { SettingsNavId } from '../SettingsPage';
import type { EditorSettings } from '../EditorSettingsPanel';
import { defaultEditorSettings } from '../EditorSettingsPanel';
import type { McpServerConfig, McpServerStatus } from '../mcpTypes';
import {
	coerceDefaultModel,
	mergeEnabledIdsWithAllModels,
	paradigmForModelEntry,
	type UserLlmProvider,
	type UserModelEntry,
} from '../modelCatalog';
import {
	defaultProviderIdentitySettings,
	resolveProviderIdentitySettings,
	type ProviderIdentitySettings,
} from '../providerIdentitySettings';
import {
	defaultAgentCustomization,
	isAnyDiskImportedSkill,
	isPluginImportedCommand,
	isPluginImportedSkill,
	mergeSkillsBySlug,
	type TeamSettings,
	type AgentCustomization,
	type AgentRule,
	type AgentSkill,
	type AgentSubagent,
} from '../agentSettingsTypes';
import type { BotIntegrationConfig } from '../botSettingsTypes';
import { coerceThinkingByModelId, type ThinkingLevel } from '../ipcTypes';
import type { ModelPickerItem } from '../ModelPickerDropdown';
import type { TFunction } from '../i18n';
import { normalizeTeamSettings } from '../teamPresetCatalog';
import { EMPTY_PLUGIN_RUNTIME_STATE, type PluginRuntimeState } from '../pluginRuntimeTypes';

/* ── Project agent slice ── */

export type ProjectAgentSliceState = {
	rules: AgentRule[];
	skills: AgentSkill[];
	subagents: AgentSubagent[];
};

export const EMPTY_PROJECT_AGENT: ProjectAgentSliceState = { rules: [], skills: [], subagents: [] };

function scheduleIdleWorkspaceLoad(fn: () => void): () => void {
	if (typeof window === 'undefined') {
		fn();
		return () => {};
	}
	if (typeof window.requestIdleCallback === 'function') {
		const id = window.requestIdleCallback(() => fn(), { timeout: 1500 });
		return () => window.cancelIdleCallback?.(id);
	}
	const id = window.setTimeout(fn, 120);
	return () => window.clearTimeout(id);
}

export type LoadedSettingsSnapshot = {
	providerIdentity?: ProviderIdentitySettings;
	defaultModel?: string;
	models?: {
		providers?: UserLlmProvider[];
		entries?: UserModelEntry[];
		enabledIds?: string[];
		thinkingByModelId?: Record<string, unknown>;
	};
	agent?: AgentCustomization;
	editor?: Partial<EditorSettings>;
	team?: TeamSettings;
	bots?: {
		integrations?: BotIntegrationConfig[];
	};
};

export function tagProjectOrigin<T extends { origin?: 'user' | 'project' }>(items: T[] | undefined): T[] {
	return (items ?? []).map((x) => ({ ...x, origin: 'project' as const }));
}

/* ── Hook ── */

export function useSettings(
	shell: NonNullable<Window['asyncShell']> | undefined,
	workspace: string | null,
	t: TFunction,
) {
	// ── Model state ──
	const [modelProviders, setModelProviders] = useState<UserLlmProvider[]>([]);
	const [defaultModel, setDefaultModel] = useState('auto');
	const [modelEntries, setModelEntries] = useState<UserModelEntry[]>([]);
	const [enabledModelIds, setEnabledModelIds] = useState<string[]>([]);
	const [thinkingByModelId, setThinkingByModelId] = useState<Record<string, ThinkingLevel>>({});
	const [providerIdentity, setProviderIdentity] = useState<ProviderIdentitySettings>(() => defaultProviderIdentitySettings());

	// ── Agent customization ──
	const [agentCustomization, setAgentCustomization] = useState<AgentCustomization>(() => defaultAgentCustomization());
	const [projectAgentSlice, setProjectAgentSlice] = useState<ProjectAgentSliceState>(EMPTY_PROJECT_AGENT);
	const [workspaceDiskSkills, setWorkspaceDiskSkills] = useState<AgentSkill[]>([]);
	const [diskSkillsRefreshTicker, setDiskSkillsRefreshTicker] = useState(0);
	const [pluginRuntimeState, setPluginRuntimeState] = useState<PluginRuntimeState>(EMPTY_PLUGIN_RUNTIME_STATE);
	const [pluginRuntimeRefreshTicker, setPluginRuntimeRefreshTicker] = useState(0);

	// ── Editor / MCP ──
	const [editorSettings, setEditorSettings] = useState<EditorSettings>(() => defaultEditorSettings());
	const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
	const [mcpStatuses, setMcpStatuses] = useState<McpServerStatus[]>([]);
	const [teamSettings, setTeamSettings] = useState<TeamSettings>({
		...normalizeTeamSettings(undefined),
	});
	const [botIntegrations, setBotIntegrations] = useState<BotIntegrationConfig[]>([]);

	// ── Settings page UI ──
	const [settingsPageOpen, setSettingsPageOpen] = useState(false);
	const [settingsInitialNav, setSettingsInitialNav] = useState<SettingsNavId>('general');
	const [settingsOpenPending, startSettingsOpenTransition] = useTransition();

	// ── Derived ──
	const hasSelectedModel = true; // Albion always has Auto (Smart Router) ready

	const mergedAgentCustomization = useMemo((): AgentCustomization => {
		const persistedSkills = [...(agentCustomization.skills ?? []), ...projectAgentSlice.skills];
		const pluginThenPersistedSkills = mergeSkillsBySlug(pluginRuntimeState.skills, persistedSkills);
		const diskSkills =
			workspaceDiskSkills.length > 0
				? mergeSkillsBySlug(pluginThenPersistedSkills, workspaceDiskSkills)
				: pluginThenPersistedSkills;
		// 应用磁盘 skill 的启用/禁用覆盖
		const overrides = agentCustomization.diskSkillEnabledOverrides ?? {};
		const skills = diskSkills.map((s) => {
			if (!isAnyDiskImportedSkill(s)) return s;
			const slug = s.slug.trim().toLowerCase();
			if (slug in overrides) {
				return { ...s, enabled: overrides[slug] };
			}
			return s;
		});
		return {
			...agentCustomization,
			rules: [...(agentCustomization.rules ?? []), ...projectAgentSlice.rules],
			skills,
			subagents: [...(agentCustomization.subagents ?? []), ...projectAgentSlice.subagents],
			commands: [...(agentCustomization.commands ?? []), ...pluginRuntimeState.commands],
		};
	}, [agentCustomization, projectAgentSlice, workspaceDiskSkills, pluginRuntimeState]);

	const onChangeMergedAgentCustomization = useCallback(
		(next: AgentCustomization) => {
			const ur = next.rules?.filter((r) => (r.origin ?? 'user') !== 'project') ?? [];
			const pr = next.rules?.filter((r) => r.origin === 'project') ?? [];
			const skillsPersist = (next.skills ?? []).filter(
				(s) => !isAnyDiskImportedSkill(s) && !isPluginImportedSkill(s)
			);
			const us = skillsPersist.filter((s) => (s.origin ?? 'user') !== 'project');
			const ps = skillsPersist.filter((s) => s.origin === 'project');
			const ua = next.subagents?.filter((s) => (s.origin ?? 'user') !== 'project') ?? [];
			const pa = next.subagents?.filter((s) => s.origin === 'project') ?? [];
			const commandsPersist = (next.commands ?? []).filter((command) => !isPluginImportedCommand(command));
			setAgentCustomization({
				...next,
				rules: ur,
				skills: us,
				subagents: ua,
				commands: commandsPersist,
			});
			const proj: ProjectAgentSliceState = { rules: pr, skills: ps, subagents: pa };
			setProjectAgentSlice(proj);
			if (shell && workspace) {
				void shell.invoke('workspaceAgent:set', proj);
			}
		},
		[shell, workspace]
	);

	// ── Albion tier (fetched from proxy /api/user/caps) ──
	const [albionTier, setAlbionTier] = useState<'free' | 'learner' | 'starter' | 'pro'>('free');
	useEffect(() => {
		let cancelled = false;
		async function fetchTier() {
			try {
				let token = '';
				if (typeof window !== 'undefined' && window.asyncShell?.invoke) {
					const auth = (await window.asyncShell.invoke('albion:auth:get')) as
						| { ok?: boolean; token?: string }
						| undefined;
					if (auth?.ok && auth.token) token = auth.token;
				}
				const proxyUrl = process.env.ALBION_PROXY_URL || 'https://albion-backend-production-a88e.up.railway.app';
				const res = await fetch(`${proxyUrl}/api/user/caps`, {
					headers: token ? { Authorization: `Bearer ${token}` } : {},
				});
				if (!res.ok || cancelled) return;
				const data = (await res.json()) as { tier?: string };
				const t = (data?.tier ?? 'free').toLowerCase();
				if (!cancelled) {
					setAlbionTier(t === 'pro' ? 'pro' : t === 'starter' ? 'starter' : t === 'learner' ? 'learner' : 'free');
				}
			} catch { /* ignore */ }
		}
		void fetchTier();
		return () => { cancelled = true; };
	}, []);

	const modelPickerItems = useMemo((): ModelPickerItem[] => {
		const enabledSet = new Set(enabledModelIds);
		const userItems = modelEntries
			.filter((e) => enabledSet.has(e.id) && (e.displayName.trim() || e.requestName.trim()))
			.map((e) => {
				const paradigm = paradigmForModelEntry(e, modelProviders);
				const paradigmLabel = paradigm ? t(`settings.paradigm.${paradigm}`) : '—';
				const provLabel = modelProviders.find((p) => p.id === e.providerId)?.displayName?.trim() ?? '';
				return {
					id: e.id,
					label: e.displayName.trim() || e.requestName,
					description: `${paradigmLabel} · ${e.requestName || t('modelPicker.requestNameMissing')}`,
					providerLabel: provLabel,
				};
			});

		// Auto (Smart Router) — always available for all tiers
		const autoItem: ModelPickerItem = {
			id: '',
			label: 'Auto (Smart Router)',
			capabilityBadge: 'Med',
			tierBadge: 'Free',
			description: 'Best model for your tier · Automatically routes across DeepSeek Flash, Qwen 2.5 & Free pool',
			providerLabel: 'Albion AI',
		};

		// Flash & Coder models — routed automatically in Free tier, selectable in Starter/Pro
		const isStarterOrPro = albionTier === 'starter' || albionTier === 'pro';
		const isPro = albionTier === 'pro';

		const nativeModels: ModelPickerItem[] = [
			{
				id: 'deepseek-v4-flash',
				label: 'DeepSeek V4 Flash',
				capabilityBadge: 'Fast',
				tierBadge: isStarterOrPro ? undefined : 'Locked',
				description: isStarterOrPro
					? 'Ultra-fast low-latency code generation'
					: 'Routed automatically in Free tier. Upgrade to Starter to select directly.',
				providerLabel: 'Albion AI',
				locked: !isStarterOrPro,
				lockTooltip: 'Upgrade to Starter to unlock direct selection (included in Auto router).',
			},
			{
				id: 'qwen3.6-35b-a3b',
				label: 'Qwen 2.5 Coder 32B',
				capabilityBadge: 'Fast',
				tierBadge: isStarterOrPro ? undefined : 'Locked',
				description: isStarterOrPro
					? 'Specialized multilingual coding & tool call synthesis'
					: 'Routed automatically in Free tier. Upgrade to Starter to select directly.',
				providerLabel: 'Albion AI',
				locked: !isStarterOrPro,
				lockTooltip: 'Upgrade to Starter to unlock direct selection (included in Auto router).',
			},
			{
				id: 'deepseek-v4-pro',
				label: 'DeepSeek V4 Pro',
				capabilityBadge: 'Pro',
				tierBadge: isPro ? undefined : 'Locked',
				description: isPro
					? 'Complex multi-step reasoning & architecture design'
					: 'Upgrade to Pro to unlock DeepSeek V4 Pro reasoning.',
				providerLabel: 'Albion AI',
				locked: !isPro,
				lockTooltip: 'Upgrade to Pro to unlock this model.',
			},
			{
				id: 'glm-5.2',
				label: 'GLM 5.2',
				capabilityBadge: 'Pro',
				tierBadge: isPro ? undefined : 'Locked',
				description: isPro
					? 'High-speed multilingual reasoning & long context'
					: 'Upgrade to Pro to unlock GLM 5.2 reasoning.',
				providerLabel: 'Albion AI',
				locked: !isPro,
				lockTooltip: 'Upgrade to Pro to unlock this model.',
			},
		];

		return [autoItem, ...nativeModels, ...userItems];
	}, [enabledModelIds, modelEntries, modelProviders, t, albionTier]);

	const modelPillLabel = useMemo(() => {
		if (!defaultModel.trim() || defaultModel === 'auto' || defaultModel === 'albion.model.auto') {
			return 'Auto (Smart Router)';
		}
		if (defaultModel === 'deepseek-v4-flash') {
			return 'DeepSeek V4 Flash';
		}
		if (defaultModel === 'qwen3.6-35b-a3b' || defaultModel === 'qwen-2.5-coder') {
			return 'Qwen 2.5 Coder';
		}
		if (defaultModel === 'deepseek-v4-pro') {
			return 'DeepSeek V4 Pro';
		}
		if (defaultModel === 'glm-5.2') {
			return 'GLM 5.2';
		}
		const e = modelEntries.find((x) => x.id === defaultModel);
		return e ? e.displayName.trim() || e.requestName || defaultModel : defaultModel;
	}, [defaultModel, modelEntries]);

	// ── Callbacks ──
	const openSettingsPage = useCallback((nav: SettingsNavId) => {
		startSettingsOpenTransition(() => {
			setSettingsInitialNav(nav);
			setSettingsPageOpen(true);
		});
	}, []);

	const onPickDefaultModel = useCallback(
		async (id: string) => {
			setDefaultModel(id);
			if (shell) {
				// Save to settings
				await shell.invoke('settings:set', { defaultModel: id });
				// Tell the proxy which model to force ('' or 'auto' = clear override, use Auto routing)
				const forceId = id === '' || id === 'auto' ? null : id;
				await shell.invoke('albion:model:force', forceId);
			}
		},
		[shell]
	);

	const onChangeModelEntries = useCallback((entries: UserModelEntry[]) => {
		setModelEntries(entries);
		setEnabledModelIds((prev) => mergeEnabledIdsWithAllModels(entries, prev));
	}, []);

	const onChangeModelProviders = useCallback((providers: UserLlmProvider[]) => {
		setModelProviders(providers);
	}, []);

	const onRefreshMcpStatuses = useCallback(async () => {
		if (!shell) return;
		const r = (await shell.invoke('mcp:getStatuses')) as { statuses?: McpServerStatus[] } | undefined;
		setMcpStatuses(r?.statuses ?? []);
	}, [shell]);

	const onStartMcpServer = useCallback(async (id: string) => {
		if (!shell) return;
		await shell.invoke('mcp:startServer', id);
		await onRefreshMcpStatuses();
	}, [shell, onRefreshMcpStatuses]);

	const onStopMcpServer = useCallback(async (id: string) => {
		if (!shell) return;
		await shell.invoke('mcp:stopServer', id);
		await onRefreshMcpStatuses();
	}, [shell, onRefreshMcpStatuses]);

	const onRestartMcpServer = useCallback(async (id: string) => {
		if (!shell) return;
		await shell.invoke('mcp:restartServer', id);
		await onRefreshMcpStatuses();
	}, [shell, onRefreshMcpStatuses]);

	const refreshWorkspaceDiskSkills = useCallback(() => {
		setDiskSkillsRefreshTicker((ticker) => ticker + 1);
	}, []);

	const refreshPluginRuntime = useCallback(() => {
		setPluginRuntimeRefreshTicker((ticker) => ticker + 1);
	}, []);

	const applyLoadedSettings = useCallback((st: LoadedSettingsSnapshot | undefined) => {
		const rawProviders = Array.isArray(st?.models?.providers) ? st.models.providers : [];
		setModelProviders(rawProviders);

		const rawEntries = Array.isArray(st?.models?.entries) ? st.models.entries : [];
		setModelEntries(rawEntries);

		const saneEnabled = mergeEnabledIdsWithAllModels(rawEntries, st?.models?.enabledIds);
		setEnabledModelIds(saneEnabled);
		setDefaultModel(coerceDefaultModel(st?.defaultModel, rawEntries, saneEnabled));
		setThinkingByModelId(coerceThinkingByModelId(st?.models?.thinkingByModelId));
		const rawProviderIdentity = st?.providerIdentity;
		if (rawProviderIdentity == null) {
			setProviderIdentity(defaultProviderIdentitySettings());
		} else {
			setProviderIdentity({
				...rawProviderIdentity,
				preset: resolveProviderIdentitySettings(rawProviderIdentity).preset,
			});
		}

		const defs = defaultAgentCustomization();
		const ag = st?.agent;
		setAgentCustomization({
			...defs,
			...(ag ?? {}),
			importThirdPartyConfigs: true,
			rules: Array.isArray(ag?.rules) ? ag.rules : [],
			skills: Array.isArray(ag?.skills) ? ag.skills : [],
			subagents: Array.isArray(ag?.subagents) ? ag.subagents : [],
			commands: Array.isArray(ag?.commands) ? ag.commands : [],
			shellPermissionMode: ag?.shellPermissionMode ?? defs.shellPermissionMode,
			confirmShellCommands: ag?.confirmShellCommands ?? defs.confirmShellCommands,
			skipSafeShellCommandsConfirm: ag?.skipSafeShellCommandsConfirm ?? defs.skipSafeShellCommandsConfirm,
			confirmWritesBeforeExecute: ag?.confirmWritesBeforeExecute ?? defs.confirmWritesBeforeExecute,
			maxConsecutiveMistakes: ag?.maxConsecutiveMistakes ?? defs.maxConsecutiveMistakes,
			mistakeLimitEnabled: ag?.mistakeLimitEnabled ?? defs.mistakeLimitEnabled,
			backgroundForkAgent: ag?.backgroundForkAgent ?? defs.backgroundForkAgent,
			toolPermissionRules: Array.isArray(ag?.toolPermissionRules) ? ag.toolPermissionRules : [],
			shouldAvoidPermissionPrompts: ag?.shouldAvoidPermissionPrompts ?? defs.shouldAvoidPermissionPrompts,
			memoryExtraction: ag?.memoryExtraction !== undefined ? { ...ag.memoryExtraction } : undefined,
		});

		if (st?.editor) {
			setEditorSettings({ ...defaultEditorSettings(), ...st.editor });
		}
		setTeamSettings(normalizeTeamSettings(st?.team));
		setBotIntegrations(Array.isArray(st?.bots?.integrations) ? st!.bots!.integrations : []);
	}, []);

	useEffect(() => {
		if (import.meta.env.DEV) {
			console.warn(
				'[VoidShell] 调试：在应用窗口按 Ctrl+Shift+I（macOS：⌥⌘I）打开开发者工具；输入 window.__voidShellTabCloseLog 查看最近记录。'
			);
		}
	}, []);

	useEffect(() => {
		if (!shell || !workspace) {
			setProjectAgentSlice(EMPTY_PROJECT_AGENT);
			return;
		}
		let cancelled = false;
		const cancelIdle = scheduleIdleWorkspaceLoad(() => {
			void (async () => {
				const r = (await shell.invoke('workspaceAgent:get')) as {
					ok?: boolean;
					slice?: { rules?: AgentRule[]; skills?: AgentSkill[]; subagents?: AgentSubagent[] };
				};
				if (cancelled) return;
				const slice = r?.slice;
				startTransition(() => {
					setProjectAgentSlice({
						rules: tagProjectOrigin(slice?.rules),
						skills: tagProjectOrigin(slice?.skills),
						subagents: tagProjectOrigin(slice?.subagents),
					});
				});
			})();
		});
		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, [shell, workspace]);

	useEffect(() => {
		if (!shell || !workspace) {
			setWorkspaceDiskSkills([]);
			return;
		}
		let cancelled = false;
		const cancelIdle = scheduleIdleWorkspaceLoad(() => {
			void (async () => {
				try {
					const r = (await shell.invoke('workspace:listDiskSkills')) as { ok?: boolean; skills?: AgentSkill[] };
					if (cancelled) return;
					startTransition(() => {
						setWorkspaceDiskSkills(Array.isArray(r?.skills) ? r.skills : []);
					});
				} catch {
					if (!cancelled) {
						setWorkspaceDiskSkills([]);
					}
				}
			})();
		});
		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, [shell, workspace, diskSkillsRefreshTicker]);

	useEffect(() => {
		if (!shell) {
			setPluginRuntimeState(EMPTY_PLUGIN_RUNTIME_STATE);
			return;
		}
		let cancelled = false;
		const cancelIdle = scheduleIdleWorkspaceLoad(() => {
			void (async () => {
				try {
					const next = (await shell.invoke('plugins:getRuntimeState')) as PluginRuntimeState;
					if (cancelled) {
						return;
					}
					startTransition(() => {
						setPluginRuntimeState(next && typeof next === 'object' ? next : EMPTY_PLUGIN_RUNTIME_STATE);
					});
				} catch {
					if (!cancelled) {
						setPluginRuntimeState(EMPTY_PLUGIN_RUNTIME_STATE);
					}
				}
			})();
		});
		return () => {
			cancelled = true;
			cancelIdle();
		};
	}, [shell, workspace, pluginRuntimeRefreshTicker]);

	useEffect(() => {
		if (!shell?.subscribePluginsChanged) {
			return;
		}
		return shell.subscribePluginsChanged(() => {
			refreshPluginRuntime();
		});
	}, [shell, refreshPluginRuntime]);

	return {
		// Model
		modelProviders, setModelProviders,
		defaultModel, setDefaultModel,
		modelEntries, setModelEntries,
		enabledModelIds, setEnabledModelIds,
		thinkingByModelId, setThinkingByModelId,
		providerIdentity, setProviderIdentity,
		hasSelectedModel,
		modelPickerItems,
		modelPillLabel,
		// Agent
		agentCustomization, setAgentCustomization,
		projectAgentSlice, setProjectAgentSlice,
		workspaceDiskSkills, setWorkspaceDiskSkills,
		diskSkillsRefreshTicker, setDiskSkillsRefreshTicker,
		refreshWorkspaceDiskSkills,
		pluginRuntimeState,
		refreshPluginRuntime,
		mergedAgentCustomization,
		onChangeMergedAgentCustomization,
		// Editor / MCP
		editorSettings, setEditorSettings,
		mcpServers, setMcpServers,
		mcpStatuses, setMcpStatuses,
		teamSettings, setTeamSettings,
		botIntegrations, setBotIntegrations,
		// Settings page
		settingsPageOpen, setSettingsPageOpen,
		settingsInitialNav,
		settingsOpenPending,
		openSettingsPage,
		// Callbacks
		onPickDefaultModel,
		onChangeModelEntries,
		onChangeModelProviders,
		onRefreshMcpStatuses,
		onStartMcpServer,
		onStopMcpServer,
		onRestartMcpServer,
		applyLoadedSettings,
	};
}
