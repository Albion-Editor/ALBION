import { useEffect, useState, useCallback } from 'react';
import { useAlbionAuth } from './albionAuthStore';
import { getAlbionProxyUrl } from './albionConfig';

export interface UserCapsResponse {
	tier: string;
	caps?: Record<string, { used: number; limit: number }>;
	models?: Record<string, { used: number; limit: number }>;
	daily_requests?: number;
	daily_tokens?: number;
	limit_requests?: number;
	limit_tokens?: number;
	cap_exceeded?: boolean;
}

function formatTokens(n: number): string {
	if (n <= 0) return '0';
	if (n >= 1000000) {
		const f = (n / 1000000).toFixed(1);
		return f.endsWith('.0') ? `${Math.floor(n / 1000000)}M` : `${f}M`;
	}
	if (n >= 1000) {
		return `${Math.round(n / 1000)}k`;
	}
	return String(n);
}

export function AlbionFuelGauge({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
	const auth = useAlbionAuth();
	const [capsData, setCapsData] = useState<UserCapsResponse | null>(null);
	const [activeModel, setActiveModel] = useState<string>('');

	const fetchCaps = useCallback(async () => {
		try {
			let token = auth.token || '';
			if (!token && typeof window !== 'undefined' && window.asyncShell?.invoke) {
				const res = (await window.asyncShell.invoke('albion:auth:get')) as
					| { ok?: boolean; token?: string }
					| undefined;
				if (res?.ok && res.token) {
					token = res.token;
				}
			}

			const res = await fetch(`${getAlbionProxyUrl()}/api/user/caps`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!res.ok) return;
			const data = (await res.json()) as UserCapsResponse;
			setCapsData(data);
		} catch {
			/* ignore fetch errors */
		}
	}, [auth.token]);

	// Initial fetch & 60s polling
	useEffect(() => {
		void fetchCaps();
		const interval = setInterval(() => {
			void fetchCaps();
		}, 60000);
		return () => clearInterval(interval);
	}, [fetchCaps]);

	// Refresh after assistant message completes
	useEffect(() => {
		if (refreshTrigger > 0) {
			void fetchCaps();
		}
	}, [refreshTrigger, fetchCaps]);

	// Listen for global custom events
	useEffect(() => {
		const refreshHandler = () => void fetchCaps();
		const modelRoutedHandler = (e: Event) => {
			const custom = e as CustomEvent<{ model?: string; provider?: string }>;
			if (custom.detail?.model) {
				const m = custom.detail.model;
				const formatted =
					m === 'groq-free'
						? 'Auto: groq-llama'
						: m === 'openrouter-free'
							? 'Auto: openrouter-free'
							: m.startsWith('Auto')
								? m
								: `Auto: ${m}`;
				setActiveModel(formatted);
			}
		};

		window.addEventListener('albion:refresh-caps', refreshHandler);
		window.addEventListener('albion:model-routed', modelRoutedHandler);

		return () => {
			window.removeEventListener('albion:refresh-caps', refreshHandler);
			window.removeEventListener('albion:model-routed', modelRoutedHandler);
		};
	}, [fetchCaps]);

	const tier = (auth.user?.tier || capsData?.tier || 'free').toLowerCase();
	const isFree = tier === 'free';
	const models = capsData?.caps || capsData?.models || {};

	const flashUsed = models['deepseek-v4-flash']?.used ?? 0;
	const flashLimit = models['deepseek-v4-flash']?.limit ?? 0;
	const proUsed = models['deepseek-v4-pro']?.used ?? 0;
	const proLimit = models['deepseek-v4-pro']?.limit ?? 0;

	const formatCapVal = (val: number) => {
		if (val <= 0) return '0';
		return formatTokens(val);
	};

	const flashStr = isFree ? `${formatCapVal(flashUsed)}/∞` : `${formatCapVal(flashUsed)}/${formatCapVal(flashLimit)}`;
	const proStr = isFree ? 'Locked' : `${formatCapVal(proUsed)}/${formatCapVal(proLimit)}`;

	// Color coding: Green for Free tier (or yellow/red on cap), or threshold-based for paid tiers
	let dotColor = '#10b981'; // Green default
	if (isFree) {
		const dailyUsed = capsData?.daily_requests ?? 0;
		const dailyLimit = capsData?.limit_requests ?? 50;
		if (capsData?.cap_exceeded || dailyUsed >= dailyLimit) {
			dotColor = '#ef4444'; // Red
		} else if (dailyUsed >= dailyLimit * 0.8) {
			dotColor = '#f59e0b'; // Yellow
		} else {
			dotColor = '#10b981'; // Green
		}
	} else {
		let minRemaining = 1.0;
		if (flashLimit > 0) {
			const r = Math.max(0, (flashLimit - flashUsed) / flashLimit);
			if (r < minRemaining) minRemaining = r;
		}
		if (proLimit > 0) {
			const r = Math.max(0, (proLimit - proUsed) / proLimit);
			if (r < minRemaining) minRemaining = r;
		}

		if (minRemaining <= 0) {
			dotColor = '#ef4444'; // Red
		} else if (minRemaining < 0.2) {
			dotColor = '#f59e0b'; // Yellow
		} else if (minRemaining > 0.5) {
			dotColor = '#10b981'; // Green
		}
	}

	const displayActiveModel = activeModel || (isFree ? 'Auto: openrouter-free' : 'Auto: deepseek-v4-flash');
	const freeDailyUsed = capsData?.daily_requests ?? 0;
	const freeDailyLimit = capsData?.limit_requests ?? 50;

	return (
		<div
			className="ref-albion-fuel-gauge"
			data-testid="fuel-gauge"
			style={{
				height: '32px',
				minHeight: '32px',
				width: '100%',
				backgroundColor: 'var(--ref-menubar-chrome-bg, var(--void-bg-1, #161D24))',
				borderTop: '1px solid var(--void-border, rgba(255, 255, 255, 0.08))',
				display: 'flex',
				alignItems: 'center',
				padding: '0 16px',
				fontSize: '12px',
				fontFamily: 'var(--font-mono, monospace)',
				color: 'var(--void-fg-2, #94A3B8)',
				userSelect: 'none',
				boxSizing: 'border-box',
				flexShrink: 0,
				justifyContent: 'space-between',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
				<span
					style={{
						display: 'inline-block',
						width: '8px',
						height: '8px',
						borderRadius: '50%',
						backgroundColor: dotColor,
						marginRight: '2px',
						flexShrink: 0,
					}}
				/>
				<span
					style={{
						display: 'inline-flex',
						alignItems: 'center',
						background: isFree ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
						color: isFree ? '#10B981' : '#F59E0B',
						border: isFree ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
						padding: '1px 6px',
						borderRadius: '4px',
						fontSize: '10px',
						fontWeight: 700,
						textTransform: 'uppercase',
						letterSpacing: '0.04em',
						flexShrink: 0,
					}}
				>
					{isFree ? 'Free Tier' : `${tier} Tier`}
				</span>
				<span style={{ letterSpacing: '0.02em', fontWeight: 500 }}>
					{isFree ? (
						<>Albion: Free Tier &nbsp;|&nbsp; {displayActiveModel} &nbsp;|&nbsp; Free Tier: {freeDailyUsed}/{freeDailyLimit} messages used today &nbsp;|&nbsp; Cost: $0.00</>
					) : (
						<>Albion: {tier} &nbsp;|&nbsp; {displayActiveModel} &nbsp;|&nbsp; Flash: {flashStr} &nbsp;|&nbsp; Pro: {proStr} &nbsp;|&nbsp; Cost: Included</>
					)}
				</span>
			</div>

			<div style={{ fontSize: '11px', color: 'var(--void-fg-3, #64748B)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
				{isFree ? (
					<span
						style={{ color: 'var(--void-accent, #F59E0B)', cursor: 'pointer', textDecoration: 'underline' }}
						onClick={() => window.dispatchEvent(new CustomEvent('albion:open-settings', { detail: { nav: 'account' } }))}
					>
						Upgrade to Pro ↗
					</span>
				) : null}
			</div>
		</div>
	);
}

