import { useState, useEffect, useRef, useCallback } from 'react';

export interface AlbionAccountMenuProps {
	onOpenAccountSettings?: () => void;
	onSignOut?: () => void;
}

export function AlbionAccountMenu({ onOpenAccountSettings }: AlbionAccountMenuProps) {
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState<string>('');
	const [tier, setTier] = useState<string>('free');
	const menuRef = useRef<HTMLDivElement>(null);

	// Fetch token & caps info
	const refreshAccountInfo = useCallback(async () => {
		try {
			let token = '';
			if (typeof window !== 'undefined' && window.asyncShell?.invoke) {
				const auth = (await window.asyncShell.invoke('albion:auth:get')) as
					| { ok?: boolean; token?: string; user?: { email?: string; id?: string } }
					| undefined;
				if (auth?.ok) {
					if (auth.token) token = auth.token;
					if (auth.user?.email) {
						setEmail(auth.user.email);
					} else if (auth.token) {
						// Decode JWT payload to get email if not explicitly provided
						try {
							const parts = auth.token.split('.');
							if (parts.length >= 2) {
								const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
								if (payload?.email) setEmail(payload.email);
							}
						} catch {
							/* ignore decode failure */
						}
					}
				}
			}

			// Also fetch user tier from proxy
			const proxyUrl = process.env.ALBION_PROXY_URL || 'https://albion-backend-production-a88e.up.railway.app';
			const res = await fetch(`${proxyUrl}/api/user/caps`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (res.ok) {
				const data = (await res.json()) as { tier?: string };
				if (data?.tier) {
					setTier(data.tier);
				}
			}
		} catch {
			/* ignore errors */
		}
	}, []);

	useEffect(() => {
		void refreshAccountInfo();
	}, [refreshAccountInfo]);

	// Close on click outside
	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		};
		window.addEventListener('mousedown', handleClickOutside);
		return () => window.removeEventListener('mousedown', handleClickOutside);
	}, [open]);

	const tierColor = tier === 'pro' ? '#f59e0b' : tier === 'starter' ? '#3b82f6' : '#94a3b8';
	const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
	const initial = (email || 'User').charAt(0).toUpperCase();

	return (
		<div ref={menuRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
			<button
				type="button"
				onClick={() => {
					setOpen((prev) => !prev);
					if (!open) void refreshAccountInfo();
				}}
				title={`Account: ${email || 'User'} (${tierLabel})`}
				style={{
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					width: '28px',
					height: '28px',
					borderRadius: '50%',
					backgroundColor: 'var(--void-bg-2, #1e293b)',
					border: '1px solid var(--void-border, rgba(255, 255, 255, 0.12))',
					color: 'var(--void-fg-0, #f8fafc)',
					fontSize: '12px',
					fontWeight: 600,
					cursor: 'pointer',
					transition: 'all 0.15s ease',
					outline: 'none',
					padding: 0,
				}}
			>
				{initial}
			</button>

			{open && (
				<div
					style={{
						position: 'absolute',
						top: 'calc(100% + 8px)',
						right: 0,
						width: '240px',
						backgroundColor: 'var(--ref-menubar-chrome-bg, #161D24)',
						border: '1px solid var(--void-border, rgba(255, 255, 255, 0.12))',
						borderRadius: '10px',
						boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
						padding: '12px',
						zIndex: 9999,
						fontSize: '12px',
						color: 'var(--void-fg-1, #cbd5e1)',
						boxSizing: 'border-box',
					}}
				>
					{/* User Header */}
					<div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
						<div
							style={{
								width: '34px',
								height: '34px',
								borderRadius: '50%',
								backgroundColor: 'var(--void-bg-2, #334155)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: '14px',
								fontWeight: 700,
								color: 'var(--void-fg-0, #f8fafc)',
								flexShrink: 0,
							}}
						>
							{initial}
						</div>
						<div style={{ overflow: 'hidden', flex: 1 }}>
							<div
								style={{
									fontWeight: 600,
									color: 'var(--void-fg-0, #f8fafc)',
									whiteSpace: 'nowrap',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									fontSize: '13px',
								}}
								title={email}
							>
								{email || 'Albion User'}
							</div>
							<div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
								<span
									style={{
										display: 'inline-block',
										padding: '1px 6px',
										borderRadius: '4px',
										backgroundColor: `${tierColor}25`,
										color: tierColor,
										fontSize: '10px',
										fontWeight: 600,
										textTransform: 'uppercase',
										letterSpacing: '0.04em',
									}}
								>
									{tierLabel} Plan
								</span>
							</div>
						</div>
					</div>

					<div
						style={{
							height: '1px',
							backgroundColor: 'var(--void-border, rgba(255, 255, 255, 0.08))',
							margin: '8px 0',
						}}
					/>

					{/* Open Account Settings Button */}
					<button
						type="button"
						onClick={() => {
							setOpen(false);
							if (onOpenAccountSettings) {
								onOpenAccountSettings();
							} else if (typeof window !== 'undefined') {
								window.dispatchEvent(new CustomEvent('albion:open-settings', { detail: { nav: 'account' } }));
							}
						}}
						style={{
							width: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '6px',
							padding: '7px 12px',
							borderRadius: '6px',
							backgroundColor: 'var(--surface-control-bg, rgba(255, 255, 255, 0.06))',
							border: '1px solid var(--void-border, rgba(255, 255, 255, 0.12))',
							color: 'var(--void-fg-0, #f8fafc)',
							fontSize: '12px',
							fontWeight: 500,
							cursor: 'pointer',
							transition: 'all 0.15s ease',
							outline: 'none',
						}}
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<circle cx="12" cy="12" r="3" />
							<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
						</svg>
						Account Settings
					</button>
				</div>
			)}
		</div>
	);
}
