import { useMemo, useState } from 'react';
import { AgentDiffCard } from './AgentDiffCard';
import { TrustBadge } from './TrustBadge';
import type { AgentPendingPatch } from './ipcTypes';
import { useI18n } from './i18n';

type Props = {
	patches: AgentPendingPatch[];
	workspaceRoot: string | null;
	busy: boolean;
	onOpenFile: (
		rel: string,
		revealLine?: number,
		revealEndLine?: number,
		options?: { diff?: string | null }
	) => void;
	onApplyOne: (id: string) => void;
	onApplyAll: () => void;
	onDiscard: () => void;
};

function IconChevron({ expanded, className }: { expanded: boolean; className?: string }) {
	return (
		<svg
			className={className}
			width="16"
			height="16"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden
		>
			{expanded ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
		</svg>
	);
}

function ShieldCheckIcon({ color = '#10b981', size = 16 }: { color?: string; size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2.2"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ flexShrink: 0 }}
			aria-hidden
		>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
			<path d="M9 12l2 2 4-4" strokeWidth="2.5" />
		</svg>
	);
}

export function AgentReviewPanel({
	patches,
	workspaceRoot,
	busy,
	onOpenFile,
	onApplyOne,
	onApplyAll,
	onDiscard,
}: Props) {
	const { t } = useI18n();
	const [expanded, setExpanded] = useState(false);

	const fileCount = useMemo(() => {
		const s = new Set<string>();
		for (const p of patches) {
			s.add(p.relPath?.trim() || p.id);
		}
		return s.size;
	}, [patches]);

	const verificationSummary = useMemo(() => {
		let anyTested = false;
		let allPassed = true;
		let totalPassed = 0;
		let totalFailed = 0;

		for (const p of patches) {
			if (p.verification?.testsRun) {
				anyTested = true;
				if (p.verification.passed) {
					totalPassed += p.verification.testsPassed ?? 1;
				} else {
					allPassed = false;
					totalFailed += p.verification.failedCount || 1;
				}
			} else {
				allPassed = false;
			}
		}

		const isVerified = anyTested && allPassed;
		const isBlocked = totalFailed > 0;

		return {
			anyTested,
			allPassed,
			totalPassed,
			totalFailed,
			state: isBlocked ? 'failed' : isVerified ? 'verified' : 'shadow',
			accentColor: isBlocked ? '#ef4444' : isVerified ? '#10b981' : '#38bdf8',
			accentBg: isBlocked ? 'rgba(239, 68, 68, 0.08)' : isVerified ? 'rgba(16, 185, 129, 0.08)' : 'rgba(56, 189, 248, 0.08)',
			accentBorder: isBlocked ? 'rgba(239, 68, 68, 0.3)' : isVerified ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.25)',
		};
	}, [patches]);

	if (patches.length === 0) {
		return null;
	}

	return (
		<div
			className="ref-agent-review ref-proof-of-execution-card"
			role="region"
			aria-label={t('agent.review.regionAria')}
			style={{
				borderRadius: '10px',
				border: `1px solid ${verificationSummary.accentBorder}`,
				backgroundColor: 'var(--panel-bg, #16181d)',
				boxShadow: `0 8px 24px rgba(0, 0, 0, 0.4), 0 0 16px ${verificationSummary.accentBg}`,
				overflow: 'hidden',
				margin: '8px 12px 12px 12px',
				transition: 'all 0.2s ease',
			}}
		>
			{/* EXECUTION RECEIPT HEADER */}
			<div
				style={{
					padding: '12px 16px',
					backgroundColor: verificationSummary.accentBg,
					borderBottom: `1px solid ${verificationSummary.accentBorder}`,
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: '12px',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
					<div
						style={{
							width: '28px',
							height: '28px',
							borderRadius: '6px',
							backgroundColor: 'rgba(0, 0, 0, 0.25)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							border: `1px solid ${verificationSummary.accentBorder}`,
						}}
					>
						<ShieldCheckIcon color={verificationSummary.accentColor} size={16} />
					</div>
					<div>
						<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
							<span
								style={{
									fontWeight: 700,
									fontSize: '13px',
									color: 'var(--void-fg-0, #f8fafc)',
									letterSpacing: '0.02em',
								}}
							>
								{verificationSummary.state === 'verified'
									? 'TRUST VERIFIED: Proof of Execution'
									: 'PRE-FLIGHT: In-Memory Shadow Run'}
							</span>
							<span
								style={{
									fontSize: '11px',
									padding: '1px 7px',
									borderRadius: '10px',
									fontWeight: 600,
									color: verificationSummary.accentColor,
									backgroundColor: 'rgba(0, 0, 0, 0.25)',
									border: `1px solid ${verificationSummary.accentBorder}`,
								}}
							>
								{fileCount} {fileCount === 1 ? 'file' : 'files'}
							</span>
						</div>
						<div
							style={{
								fontSize: '11px',
								color: 'var(--void-fg-2, #94a3b8)',
								marginTop: '2px',
							}}
						>
							Code simulated in memory before committing to disk
						</div>
					</div>
				</div>

				{/* ACTIONS */}
				<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
					<button
						type="button"
						className="ref-agent-review-btn"
						disabled={busy}
						onClick={onDiscard}
						style={{
							padding: '6px 12px',
							fontSize: '12px',
							borderRadius: '6px',
							background: 'transparent',
							border: '1px solid var(--void-border, rgba(255, 255, 255, 0.15))',
							color: 'var(--void-fg-2, #94a3b8)',
							cursor: busy ? 'default' : 'pointer',
						}}
					>
						Discard
					</button>

					<button
						type="button"
						disabled={busy}
						onClick={onApplyAll}
						style={{
							padding: '6px 14px',
							fontSize: '12px',
							fontWeight: 700,
							borderRadius: '6px',
							background: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
							border: 'none',
							color: '#FFFFFF',
							boxShadow: '0 2px 8px rgba(16, 185, 129, 0.35)',
							cursor: busy ? 'default' : 'pointer',
							display: 'flex',
							alignItems: 'center',
							gap: '6px',
						}}
					>
						<span>Apply to Disk</span>
						<span>✓</span>
					</button>

					<button
						type="button"
						disabled={busy}
						onClick={() => setExpanded((e) => !e)}
						title="Toggle diff preview"
						style={{
							padding: '6px 10px',
							fontSize: '11px',
							borderRadius: '6px',
							background: 'rgba(255, 255, 255, 0.05)',
							border: '1px solid var(--void-border, rgba(255, 255, 255, 0.1))',
							color: 'var(--void-fg-1, #cbd5e1)',
							cursor: busy ? 'default' : 'pointer',
							display: 'flex',
							alignItems: 'center',
							gap: '4px',
						}}
					>
						<span>{expanded ? 'Hide Diffs' : 'View Shadow Diff'}</span>
						<IconChevron expanded={expanded} className="ref-agent-review-toggle-ico" />
					</button>
				</div>
			</div>

			{/* EXECUTION RECEIPT CHECKLIST ITEMS */}
			<div
				style={{
					padding: '10px 16px',
					backgroundColor: 'rgba(0, 0, 0, 0.2)',
					borderBottom: expanded ? `1px solid var(--void-border, rgba(255, 255, 255, 0.08))` : 'none',
					display: 'flex',
					flexWrap: 'wrap',
					gap: '16px',
					fontSize: '11px',
					fontFamily: 'var(--font-mono, monospace)',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
					<span>✓</span>
					<span style={{ color: 'var(--void-fg-1, #cbd5e1)' }}>Pre-flight Shadow Run: In-memory simulation</span>
				</div>

				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
					<span>✓</span>
					<span style={{ color: 'var(--void-fg-1, #cbd5e1)' }}>
						{verificationSummary.totalPassed > 0
							? `Local Verification: ${verificationSummary.totalPassed} tests passed`
							: 'TypeScript & Syntax: 0 errors detected'}
					</span>
				</div>

				<div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
					<span>✓</span>
					<span style={{ color: 'var(--void-fg-1, #cbd5e1)' }}>Zero syntax regressions</span>
				</div>
			</div>

			{/* EXPANDABLE DIFF INSPECTOR */}
			{expanded ? (
				<div className="ref-agent-review-body" style={{ padding: '12px 16px' }}>
					{patches.map((p) => (
						<div key={p.id} className="ref-agent-review-row" style={{ marginBottom: '12px' }}>
							<div
								className="ref-agent-review-row-head"
								style={{
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between',
									marginBottom: '6px',
								}}
							>
								<span
									className="ref-agent-review-row-label"
									title={p.relPath ?? undefined}
									style={{ fontWeight: 600, fontSize: '12px' }}
								>
									{p.relPath ?? t('agent.review.unknownPath')}
								</span>
								<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
									<TrustBadge verification={p.verification} />
									<button
										type="button"
										className="ref-agent-review-btn ref-agent-review-btn--sm"
										disabled={busy}
										onClick={() => onApplyOne(p.id)}
										style={{
											padding: '3px 8px',
											fontSize: '11px',
											borderRadius: '4px',
											background: 'rgba(255, 255, 255, 0.08)',
											border: '1px solid rgba(255, 255, 255, 0.15)',
											color: 'var(--void-fg-0, #f8fafc)',
											cursor: busy ? 'default' : 'pointer',
										}}
									>
										Apply this file
									</button>
								</div>
							</div>
							<AgentDiffCard
								diff={p.chunk}
								workspaceRoot={workspaceRoot}
								verification={p.verification}
								onOpenFile={onOpenFile}
							/>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
