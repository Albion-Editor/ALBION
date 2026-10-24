/**
 * AlbionCostRadar — Session token burn tracker for Albion IDE.
 *
 * Shows:
 *   - Session tokens used in the current session
 *   - Session cost in USD and NGN (blended rate: $0.156 / 1M tokens)
 *   - Remaining lifetime (free) or monthly (paid) tokens
 *
 * No smart routing. No model prediction. Works with manual model selection.
 * Listens to the `albion:tokens-used` custom event fired by the proxy
 * response handler after each inference call.
 */

import { useEffect, useState } from 'react';
import { useAlbionAuth } from './albionAuthStore';
import { useAlbionCaps } from './albionCapsStore';
import {
	BLENDED_COST_PER_MILLION_USD,
	FREE_TIER_TOKEN_CAP,
	USD_TO_NGN,
	formatNgn,
	formatTokens,
	formatUsd,
	getLifetimeStatus,
} from './albionFreeTier';

// ---------------------------------------------------------------------------
// Session store — persists across renders, resets on page reload
// ---------------------------------------------------------------------------
let _sessionTokens = 0;
const _sessionListeners = new Set<() => void>();

function addSessionTokens(n: number): void {
	_sessionTokens += Math.max(0, n);
	for (const cb of _sessionListeners) cb();
}

function useSessionTokens(): number {
	const [tokens, setTokens] = useState(_sessionTokens);
	useEffect(() => {
		const cb = () => setTokens(_sessionTokens);
		_sessionListeners.add(cb);
		return () => { _sessionListeners.delete(cb); };
	}, []);
	return tokens;
}

// ---------------------------------------------------------------------------
// Global event listener — set up once at module load
// The proxy/stream reader dispatches this after each successful inference.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined') {
	window.addEventListener('albion:tokens-used', (e: Event) => {
		const ev = e as CustomEvent<{ total?: number; prompt?: number; completion?: number }>;
		const total = ev.detail?.total ?? (ev.detail?.prompt ?? 0) + (ev.detail?.completion ?? 0);
		if (total > 0) addSessionTokens(total);
	});
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AlbionCostRadar() {
	const auth = useAlbionAuth();
	const caps = useAlbionCaps();
	const sessionTokens = useSessionTokens();
	const tier = (auth.user?.tier || caps.data?.tier || 'free').toLowerCase();
	const isFree = tier === 'free';
	const lifetime = getLifetimeStatus(caps.data);

	// Session cost
	const sessionCostUsd = (sessionTokens / 1_000_000) * BLENDED_COST_PER_MILLION_USD;
	const sessionCostNgn = sessionCostUsd * USD_TO_NGN;

	// Remaining for free tier
	const lifetimeRemaining = Math.max(0, lifetime.cap - lifetime.used);

	// For paid tiers — pull total monthly balance from caps
	const models = caps.data?.caps || caps.data?.models || {};
	const monthlyUsed = Object.values(models).reduce(
		(acc: number, m) => acc + ((m as { used?: number }).used ?? 0),
		0
	);
	const monthlyLimit = Object.values(models).reduce(
		(acc: number, m) => acc + ((m as { limit?: number }).limit ?? 0),
		0
	);
	const monthlyRemaining = Math.max(0, monthlyLimit - monthlyUsed);

	// Color cues
	const isWarning = isFree ? lifetime.warning : monthlyRemaining / Math.max(monthlyLimit, 1) < 0.2;
	const isLocked = isFree ? lifetime.locked : monthlyRemaining <= 0;
	const textColor = isLocked
		? '#F87171'
		: isWarning
			? '#F59E0B'
			: 'var(--void-fg-3, #64748B)';

	return (
		<div
			className="ref-albion-cost-radar"
			data-testid="cost-radar"
			style={{
				width: '100%',
				backgroundColor: 'var(--ref-menubar-chrome-bg, var(--void-bg-1, #161D24))',
				borderTop: '1px solid var(--void-border, rgba(255,255,255,0.05))',
				padding: '4px 16px',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'space-between',
				fontSize: '11px',
				fontFamily: 'var(--font-mono, monospace)',
				color: textColor,
				userSelect: 'none',
				whiteSpace: 'nowrap',
				overflow: 'hidden',
				letterSpacing: '0.01em',
				boxSizing: 'border-box',
				flexShrink: 0,
				gap: '8px',
			}}
			title="Albion Cost Radar — live session burn tracker"
		>
			{/* Left: session stats */}
			<span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
				{'⚡ '}
				<span style={{ color: 'var(--void-fg-2, #94A3B8)' }}>Session:</span>
				{' '}
				{formatTokens(sessionTokens)} tokens
				{' · '}
				~{formatUsd(sessionCostUsd)}
				{' ('}
				{formatNgn(sessionCostNgn)}
				{')'}
			</span>

			{/* Right: remaining balance */}
			<span style={{ flexShrink: 0, color: isLocked ? '#F87171' : isWarning ? '#F59E0B' : 'var(--void-fg-3,#64748B)' }}>
				{isFree ? (
					isLocked ? (
						<>
							<span style={{ color: '#F87171', fontWeight: 600 }}>Lifetime cap reached</span>
							{' · '}
							<span
								style={{ color: 'var(--void-accent, #F59E0B)', cursor: 'pointer', textDecoration: 'underline' }}
								onClick={() => window.dispatchEvent(new CustomEvent('albion:open-settings', { detail: { nav: 'account' } }))}
							>
								Upgrade
							</span>
						</>
					) : (
						<>
							{'Remaining: '}
							<span style={{ color: isWarning ? '#F59E0B' : 'var(--void-fg-2,#94A3B8)', fontWeight: 600 }}>
								{formatTokens(lifetimeRemaining)}/{formatTokens(FREE_TIER_TOKEN_CAP)}
							</span>
							{' lifetime'}
						</>
					)
				) : (
					monthlyLimit > 0 ? (
						<>
							{'Remaining: '}
							<span style={{ color: isWarning ? '#F59E0B' : 'var(--void-fg-2,#94A3B8)', fontWeight: 600 }}>
								{formatTokens(monthlyRemaining)}/{formatTokens(monthlyLimit)}
							</span>
							{' this month'}
						</>
					) : (
						<span style={{ color: 'var(--void-fg-3,#64748B)' }}>Monthly allowance loading…</span>
					)
				)}
			</span>
		</div>
	);
}
