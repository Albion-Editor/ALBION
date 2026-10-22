import { useEffect, useState } from 'react';
import { useAlbionAuth } from './albionAuthStore';
import { refreshAlbionCaps, setAlbionCapsToken, useAlbionCaps } from './albionCapsStore';
import { formatNgn, formatTokens, formatUsd, getLifetimeStatus } from './albionFreeTier';

export type { UserCapsResponse } from './albionFreeTier';

export function AlbionFuelGauge({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
	const auth = useAlbionAuth();
	const caps = useAlbionCaps();
	const [activeModel, setActiveModel] = useState<string>('');
	const tier = (auth.user?.tier || caps.data?.tier || 'free').toLowerCase();
	const isFree = tier === 'free';
	const lifetime = getLifetimeStatus(caps.data);

	useEffect(() => {
		setAlbionCapsToken(auth.token || null);
	}, [auth.token]);

	useEffect(() => {
		void refreshAlbionCaps();
		const interval = setInterval(() => {
			void refreshAlbionCaps();
		}, 60000);
		return () => clearInterval(interval);
	}, []);

	useEffect(() => {
		if (refreshTrigger > 0) {
			void refreshAlbionCaps();
		}
	}, [refreshTrigger]);

	useEffect(() => {
		const refreshHandler = () => void refreshAlbionCaps();
		const modelRoutedHandler = (e: Event) => {
			const custom = e as CustomEvent<{ model?: string; provider?: string }>;
			if (custom.detail?.model) {
				const m = custom.detail.model;
				setActiveModel(m.startsWith('Auto') ? m : `Auto: ${m}`);
			}
		};

		window.addEventListener('albion:refresh-caps', refreshHandler);
		window.addEventListener('albion:model-routed', modelRoutedHandler);

		return () => {
			window.removeEventListener('albion:refresh-caps', refreshHandler);
			window.removeEventListener('albion:model-routed', modelRoutedHandler);
		};
	}, []);

	const models = caps.data?.caps || caps.data?.models || {};
	const flashUsed = models['deepseek-v4-flash']?.used ?? 0;
	const flashLimit = models['deepseek-v4-flash']?.limit ?? 0;
	const proUsed = models['deepseek-v4-pro']?.used ?? 0;
	const proLimit = models['deepseek-v4-pro']?.limit ?? 0;

	const flashStr = `${formatTokens(flashUsed)}/${formatTokens(flashLimit)}`;
	const proStr = `${formatTokens(proUsed)}/${formatTokens(proLimit)}`;

	let dotColor = '#10b981';
	if (isFree) {
		if (lifetime.locked) dotColor = '#ef4444';
		else if (lifetime.warning) dotColor = '#f59e0b';
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
		if (minRemaining <= 0) dotColor = '#ef4444';
		else if (minRemaining < 0.2) dotColor = '#f59e0b';
	}

	const displayActiveModel = activeModel || (isFree ? 'Auto: deepseek-v4-flash' : 'Auto: deepseek-v4-flash');
	const freePercentLabel = `${lifetime.percent.toFixed(lifetime.percent < 10 ? 1 : 0)}%`;

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
						<>
							Albion: Free Tier &nbsp;|&nbsp; {displayActiveModel} &nbsp;|&nbsp; Lifetime: {formatTokens(lifetime.used)}/{formatTokens(lifetime.cap)} tokens ({freePercentLabel}) &nbsp;|&nbsp; Remaining: {formatTokens(lifetime.remaining)} &nbsp;|&nbsp; Cost: {formatUsd(lifetime.costUsd)}
						</>
					) : (
						<>
							Albion: {tier} &nbsp;|&nbsp; {displayActiveModel} &nbsp;|&nbsp; Flash: {flashStr} &nbsp;|&nbsp; Pro: {proStr} &nbsp;|&nbsp; Cost: Included
						</>
					)}
				</span>
			</div>

			<div style={{ fontSize: '11px', color: 'var(--void-fg-3, #64748B)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
				{isFree ? (
					<>
						{lifetime.locked ? (
							<span style={{ color: '#F87171', fontWeight: 600 }}>Upgrade required</span>
						) : lifetime.warning ? (
							<span style={{ color: '#F59E0B', fontWeight: 600 }}>{freePercentLabel} used</span>
						) : null}
						<span style={{ color: 'var(--void-fg-3, #64748B)' }} title="Blended DeepSeek V4.1 Flash estimate">
							{formatNgn(lifetime.costNgn)}
						</span>
						<span
							style={{ color: 'var(--void-accent, #F59E0B)', cursor: 'pointer', textDecoration: 'underline' }}
							onClick={() => window.dispatchEvent(new CustomEvent('albion:open-settings', { detail: { nav: 'account' } }))}
						>
							Upgrade to Pro ↗
						</span>
					</>
				) : null}
			</div>
		</div>
	);
}
