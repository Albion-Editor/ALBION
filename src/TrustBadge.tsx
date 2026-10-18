import { useState } from 'react';
import type { TrustVerificationResult } from './ipcTypes';

export interface TrustBadgeProps {
	verification?: TrustVerificationResult | null;
	className?: string;
}

export type TrustBadgeState = 'verified' | 'unverified' | 'failed';

export function getTrustBadgeProps(verification?: TrustVerificationResult | null): {
	state: TrustBadgeState;
	label: string;
	color: string;
	bgColor: string;
	borderColor: string;
} {
	// HARD RULE: NEVER green when testsRun === false!
	if (!verification || verification.testsRun === false) {
		return {
			state: 'unverified',
			label: 'Unverified (no tests found)',
			color: '#f59e0b',
			bgColor: 'rgba(245, 158, 11, 0.12)',
			borderColor: 'rgba(245, 158, 11, 0.35)',
		};
	}

	if (verification.testsRun === true && verification.passed === true) {
		const passedCount = verification.testsPassed ?? 1;
		return {
			state: 'verified',
			label: `Verified (${passedCount} test${passedCount === 1 ? '' : 's'} passed)`,
			color: '#10b981',
			bgColor: 'rgba(16, 185, 129, 0.12)',
			borderColor: 'rgba(16, 185, 129, 0.35)',
		};
	}

	const failedCount = verification.failedCount > 0 ? verification.failedCount : 1;
	return {
		state: 'failed',
		label: `Blocked (${failedCount} test${failedCount === 1 ? '' : 's'} failed)`,
		color: '#ef4444',
		bgColor: 'rgba(239, 68, 68, 0.12)',
		borderColor: 'rgba(239, 68, 68, 0.35)',
	};
}

function ShieldIcon({ state, color }: { state: TrustBadgeState; color: string }) {
	return (
		<svg
			width="14"
			height="14"
			viewBox="0 0 24 24"
			fill="none"
			stroke={color}
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			style={{ marginRight: '5px', flexShrink: 0 }}
			aria-hidden
		>
			<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
			{state === 'verified' && <path d="M9 12l2 2 4-4" strokeWidth="2.5" />}
			{state === 'failed' && (
				<>
					<path d="M9 9l6 6" strokeWidth="2" />
					<path d="M15 9l-6 6" strokeWidth="2" />
				</>
			)}
			{state === 'unverified' && (
				<>
					<circle cx="12" cy="11" r="0.5" fill={color} strokeWidth="2" />
					<path d="M12 15h.01" strokeWidth="2.5" />
				</>
			)}
		</svg>
	);
}

export function TrustBadge({ verification, className = '' }: TrustBadgeProps) {
	const [isOpen, setIsOpen] = useState(false);
	const badge = getTrustBadgeProps(verification);

	return (
		<>
			<button
				type="button"
				className={`ref-trust-badge ${className}`}
				data-testid="trust-badge"
				data-state={badge.state}
				onClick={(e) => {
					e.stopPropagation();
					setIsOpen(true);
				}}
				title="Click to view verification test logs"
				style={{
					display: 'inline-flex',
					alignItems: 'center',
					padding: '2px 8px',
					borderRadius: '4px',
					fontSize: '11px',
					fontWeight: 500,
					fontFamily: 'var(--font-mono, monospace)',
					color: badge.color,
					backgroundColor: badge.bgColor,
					border: `1px solid ${badge.borderColor}`,
					cursor: 'pointer',
					userSelect: 'none',
					whiteSpace: 'nowrap',
					lineHeight: '18px',
					transition: 'opacity 0.15s ease',
				}}
			>
				<ShieldIcon state={badge.state} color={badge.color} />
				<span>{badge.label}</span>
			</button>

			{isOpen ? (
				<div
					className="ref-trust-modal-backdrop"
					style={{
						position: 'fixed',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.65)',
						backdropFilter: 'blur(2px)',
						zIndex: 99999,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
					}}
					onClick={(e) => {
						e.stopPropagation();
						setIsOpen(false);
					}}
				>
					<div
						className="ref-trust-modal-card"
						style={{
							width: '640px',
							maxWidth: '90vw',
							maxHeight: '80vh',
							backgroundColor: 'var(--panel-bg, #1e1e24)',
							borderRadius: '8px',
							border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
							boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
							display: 'flex',
							flexDirection: 'column',
							overflow: 'hidden',
						}}
						onClick={(e) => e.stopPropagation()}
					>
						<div
							style={{
								padding: '12px 16px',
								borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
								<ShieldIcon state={badge.state} color={badge.color} />
								<span style={{ fontWeight: 600, fontSize: '13px' }}>Trust Verification: {badge.label}</span>
							</div>
							<button
								type="button"
								onClick={() => setIsOpen(false)}
								style={{
									background: 'none',
									border: 'none',
									color: 'var(--text-subtle, #888)',
									cursor: 'pointer',
									fontSize: '16px',
									padding: '4px',
								}}
							>
								✕
							</button>
						</div>

						<div style={{ padding: '16px', overflowY: 'auto', flex: 1 }}>
							<div style={{ fontSize: '12px', color: 'var(--text-subtle, #aaa)', marginBottom: '8px' }}>
								Verification Test Output:
							</div>
							<pre
								style={{
									margin: 0,
									padding: '12px',
									backgroundColor: 'var(--editor-bg, #141416)',
									borderRadius: '6px',
									border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.06))',
									color: 'var(--text-primary, #ddd)',
									fontSize: '11px',
									lineHeight: '1.5',
									fontFamily: 'var(--font-mono, monospace)',
									whiteSpace: 'pre-wrap',
									wordBreak: 'break-all',
									maxHeight: '400px',
									overflowY: 'auto',
								}}
							>
								{verification?.outputTail || 'No test output available.'}
							</pre>
						</div>
					</div>
				</div>
			) : null}
		</>
	);
}
