import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { hideBootSplash } from './bootSplash';
import { BrandLogo } from './BrandLogo';

// Supabase project config (public anon key is safe on client)
const SUPABASE_URL = 'https://sowgaavkscitxfkyvjaq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNvd2dhYXZrc2NpdHhma3l2amFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1MzMzNDcsImV4cCI6MjEwNDEwOTM0N30.8J0zcQ4pA6vXsL_9p4Mu-nyHnPtzXz2LnRcKUJ1VwZo';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

interface AlbionLoginProps {
	onLoginSuccess: (token: string, user: { id: string; email?: string }) => void;
}

export const AlbionLogin: React.FC<AlbionLoginProps> = ({ onLoginSuccess }) => {
	const [mode, setMode] = useState<'signin' | 'signup'>('signin');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [loading, setLoading] = useState(false);
	const [oauthLoading, setOauthLoading] = useState<'github' | 'google' | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [successMsg, setSuccessMsg] = useState<string | null>(null);

	const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
	const oauthWindowRef = useRef<Window | null>(null);

	useEffect(() => {
		hideBootSplash();

		// Subscribe to global auth state changes (e.g. from deep links or other windows)
		const unsub = window.asyncShell?.subscribeAuthState?.((payload: { isAuthenticated: boolean; user?: { id: string; email?: string } | null; token?: string }) => {
			if (payload?.isAuthenticated) {
				if (pollTimerRef.current) {
					clearInterval(pollTimerRef.current);
					pollTimerRef.current = null;
				}
				if (oauthWindowRef.current && !oauthWindowRef.current.closed) {
					try {
						oauthWindowRef.current.close();
					} catch (_) {}
				}
				setOauthLoading(null);
				const token = payload.token || '';
				const user = payload.user || { id: 'albion-user', email: 'user@albion.dev' };
				onLoginSuccess(token, user);
			}
		});

		return () => {
			if (pollTimerRef.current) clearInterval(pollTimerRef.current);
			unsub?.();
		};
	}, [onLoginSuccess]);

	// Complete login and persist credentials
	const finishAuth = async (token: string, user: { id: string; email?: string }) => {
		if (pollTimerRef.current) {
			clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
		if (oauthWindowRef.current && !oauthWindowRef.current.closed) {
			try {
				oauthWindowRef.current.close();
			} catch (_) {}
		}
		setOauthLoading(null);
		if (window.asyncShell?.invoke) {
			try {
				await window.asyncShell.invoke('albion:auth:save', { token, user });
			} catch (err) {
				console.warn('Failed to persist auth via IPC:', err);
			}
		}
		onLoginSuccess(token, user);
	};

	// OAuth login handler (GitHub / Google)
	const handleOAuth = async (provider: 'github' | 'google') => {
		setError(null);
		setSuccessMsg(null);
		setOauthLoading(provider);

		try {
			const { data, error: oauthError } = await supabaseClient.auth.signInWithOAuth({
				provider,
				options: {
					skipBrowserRedirect: true,
					redirectTo: 'https://albionide.com/auth/callback'
				}
			});

			if (oauthError || !data?.url) {
				setError(oauthError?.message || `Failed to initiate ${provider} login.`);
				setOauthLoading(null);
				return;
			}

			// Open system browser for authorization
			oauthWindowRef.current = window.open(data.url, '_blank');
			setSuccessMsg(`Browser opened for ${provider === 'github' ? 'GitHub' : 'Google'} sign-in. Waiting for authorization...`);

			// Start polling proxy for callback token
			if (pollTimerRef.current) clearInterval(pollTimerRef.current);
			let attempts = 0;

			pollTimerRef.current = setInterval(async () => {
				attempts++;
				if (attempts > 90) { // 2.5 minute timeout
					if (pollTimerRef.current) clearInterval(pollTimerRef.current);
					setOauthLoading(null);
					setError('Sign-in timed out. Please try again.');
					return;
				}

				try {
					const res = await fetch('https://albion-backend-production.up.railway.app/auth/poll-token');
					if (res.ok) {
						const json = await res.json();
						if (json.token) {
							if (pollTimerRef.current) clearInterval(pollTimerRef.current);
							pollTimerRef.current = null;
							setOauthLoading(null);

							// Fetch user identity with the token
							if (json.user && json.user.id) {
								finishAuth(json.token, json.user);
							} else {
								const { data: authData, error: userErr } = await supabaseClient.auth.getUser(json.token);
								if (!userErr && authData?.user) {
									finishAuth(json.token, { id: authData.user.id, email: authData.user.email });
								} else {
									finishAuth(json.token, { id: 'oauth-user', email: 'user@albion.dev' });
								}
							}
						}
					}
				} catch (_) {
					// Ignore transient poll fetch errors
				}
			}, 1500);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : 'OAuth request failed';
			setError(message);
			setOauthLoading(null);
		}
	};

	// Email/Password Submit Handler
	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(null);
		setSuccessMsg(null);

		const cleanEmail = email.trim();
		if (!cleanEmail || !password) {
			setError('Please enter your email and password.');
			return;
		}

		if (mode === 'signup') {
			if (password.length < 6) {
				setError('Password must be at least 6 characters long.');
				return;
			}
			if (password !== confirmPassword) {
				setError('Passwords do not match.');
				return;
			}

			setLoading(true);
			try {
				const { data, error: signUpError } = await supabaseClient.auth.signUp({
					email: cleanEmail,
					password,
				});

				if (signUpError) {
					setError(signUpError.message);
					setLoading(false);
					return;
				}

				if (data.session) {
					// Instant session created
					finishAuth(data.session.access_token, {
						id: data.user?.id || 'new-user',
						email: data.user?.email || cleanEmail
					});
				} else {
					// Email confirmation required or created
					setSuccessMsg('Account created successfully! If email verification is enabled, check your inbox, then sign in.');
					setMode('signin');
					setPassword('');
					setConfirmPassword('');
				}
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Sign-up failed';
				setError(message);
			} finally {
				setLoading(false);
			}
		} else {
			// Sign In
			setLoading(true);
			try {
				const { data, error: authError } = await supabaseClient.auth.signInWithPassword({
					email: cleanEmail,
					password,
				});

				if (authError || !data.session) {
					setError(authError?.message || 'Login failed. Please check your credentials.');
					setLoading(false);
					return;
				}

				finishAuth(data.session.access_token, {
					id: data.user.id,
					email: data.user.email
				});
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : 'Unexpected login error';
				setError(message);
			} finally {
				setLoading(false);
			}
		}
	};

	return (
		<div style={{
			display: 'flex',
			alignItems: 'center',
			justifyContent: 'center',
			minHeight: '100vh',
			width: '100vw',
			backgroundColor: '#0f172a',
			color: '#f8fafc',
			fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
			padding: '20px',
			boxSizing: 'border-box'
		}}>
			<div style={{
				width: '100%',
				maxWidth: '420px',
				padding: '36px 32px',
				borderRadius: '16px',
				backgroundColor: '#1e293b',
				boxShadow: '0 20px 30px -10px rgba(0, 0, 0, 0.6), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
				border: '1px solid #334155'
			}}>
				{/* Brand Logo & Header */}
				<div style={{ textAlign: 'center', marginBottom: '24px' }}>
					<div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '12px' }}>
						<BrandLogo size={68} />
					</div>
					<h1 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 6px 0', letterSpacing: '-0.025em', color: '#f8fafc' }}>
						Albion
					</h1>
					<p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
						{mode === 'signup' ? 'Create your Albion developer account' : 'The AI-Native IDE for High-Speed Builders'}
					</p>
				</div>

				{/* Social Login Options */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
					<button
						type="button"
						onClick={() => handleOAuth('github')}
						disabled={loading || oauthLoading !== null}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '10px',
							width: '100%',
							padding: '10px 16px',
							borderRadius: '8px',
							backgroundColor: '#0f172a',
							border: '1px solid #475569',
							color: '#f8fafc',
							fontSize: '13px',
							fontWeight: 600,
							cursor: oauthLoading ? 'not-allowed' : 'pointer',
							transition: 'all 0.15s ease'
						}}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
							<path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
						</svg>
						{oauthLoading === 'github' ? 'Connecting to GitHub...' : 'Continue with GitHub'}
					</button>

					{/* Google OAuth - temporarily hidden for launch (email/pw + GitHub only); uncomment to re-enable
					<button
						type="button"
						onClick={() => handleOAuth('google')}
						disabled={loading || oauthLoading !== null}
						style={{
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							gap: '10px',
							width: '100%',
							padding: '10px 16px',
							borderRadius: '8px',
							backgroundColor: '#0f172a',
							border: '1px solid #475569',
							color: '#f8fafc',
							fontSize: '13px',
							fontWeight: 600,
							cursor: oauthLoading ? 'not-allowed' : 'pointer',
							transition: 'all 0.15s ease'
						}}
					>
						<svg width="18" height="18" viewBox="0 0 24 24">
							<path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
							<path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
							<path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
							<path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
						</svg>
						{oauthLoading === 'google' ? 'Connecting to Google...' : 'Continue with Google'}
					</button>
					*/}
				</div>

				{/* Divider */}
				<div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: '12px' }}>
					<div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
					<span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
						or with email
					</span>
					<div style={{ flex: 1, height: '1px', backgroundColor: '#334155' }} />
				</div>

				{/* Tab Selector: Sign In vs Sign Up */}
				<div style={{
					display: 'flex',
					padding: '3px',
					backgroundColor: '#0f172a',
					borderRadius: '8px',
					marginBottom: '20px',
					border: '1px solid #334155'
				}}>
					<button
						type="button"
						onClick={() => { setMode('signin'); setError(null); setSuccessMsg(null); }}
						style={{
							flex: 1,
							padding: '8px 0',
							borderRadius: '6px',
							border: 'none',
							backgroundColor: mode === 'signin' ? '#3b82f6' : 'transparent',
							color: mode === 'signin' ? '#ffffff' : '#94a3b8',
							fontSize: '12px',
							fontWeight: 600,
							cursor: 'pointer',
							transition: 'all 0.15s ease'
						}}
					>
						Sign In
					</button>
					<button
						type="button"
						onClick={() => { setMode('signup'); setError(null); setSuccessMsg(null); }}
						style={{
							flex: 1,
							padding: '8px 0',
							borderRadius: '6px',
							border: 'none',
							backgroundColor: mode === 'signup' ? '#3b82f6' : 'transparent',
							color: mode === 'signup' ? '#ffffff' : '#94a3b8',
							fontSize: '12px',
							fontWeight: 600,
							cursor: 'pointer',
							transition: 'all 0.15s ease'
						}}
					>
						Create Account
					</button>
				</div>

				{/* Feedback Notices */}
				{error && (
					<div style={{
						padding: '10px 14px',
						marginBottom: '16px',
						borderRadius: '8px',
						backgroundColor: 'rgba(239, 68, 68, 0.15)',
						border: '1px solid #ef4444',
						color: '#fca5a5',
						fontSize: '12px',
						lineHeight: 1.4
					}}>
						{error}
					</div>
				)}

				{successMsg && (
					<div style={{
						padding: '10px 14px',
						marginBottom: '16px',
						borderRadius: '8px',
						backgroundColor: 'rgba(16, 185, 129, 0.15)',
						border: '1px solid #10b981',
						color: '#6ee7b7',
						fontSize: '12px',
						lineHeight: 1.4
					}}>
						{successMsg}
					</div>
				)}

				{/* Form */}
				<form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
					<div>
						<label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
							Email address
						</label>
						<input
							type="email"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							placeholder="you@domain.com"
							disabled={loading || oauthLoading !== null}
							required
							style={{
								width: '100%',
								padding: '10px 12px',
								borderRadius: '8px',
								backgroundColor: '#0f172a',
								border: '1px solid #475569',
								color: '#f8fafc',
								fontSize: '13px',
								outline: 'none',
								boxSizing: 'border-box'
							}}
						/>
					</div>

					<div>
						<label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							placeholder="••••••••"
							disabled={loading || oauthLoading !== null}
							required
							style={{
								width: '100%',
								padding: '10px 12px',
								borderRadius: '8px',
								backgroundColor: '#0f172a',
								border: '1px solid #475569',
								color: '#f8fafc',
								fontSize: '13px',
								outline: 'none',
								boxSizing: 'border-box'
							}}
						/>
					</div>

					{mode === 'signup' && (
						<div>
							<label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#cbd5e1', marginBottom: '6px' }}>
								Confirm Password
							</label>
							<input
								type="password"
								value={confirmPassword}
								onChange={(e) => setConfirmPassword(e.target.value)}
								placeholder="••••••••"
								disabled={loading || oauthLoading !== null}
								required
								style={{
									width: '100%',
									padding: '10px 12px',
									borderRadius: '8px',
									backgroundColor: '#0f172a',
									border: '1px solid #475569',
									color: '#f8fafc',
									fontSize: '13px',
									outline: 'none',
									boxSizing: 'border-box'
								}}
							/>
						</div>
					)}

					<button
						type="submit"
						disabled={loading || oauthLoading !== null}
						style={{
							marginTop: '6px',
							padding: '11px 16px',
							borderRadius: '8px',
							backgroundColor: '#3b82f6',
							color: '#ffffff',
							fontSize: '13px',
							fontWeight: 600,
							border: 'none',
							cursor: (loading || oauthLoading) ? 'not-allowed' : 'pointer',
							opacity: (loading || oauthLoading) ? 0.7 : 1,
							boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.3)',
							transition: 'all 0.15s ease'
						}}
					>
						{loading
							? (mode === 'signup' ? 'Creating Account...' : 'Signing in...')
							: (mode === 'signup' ? 'Create Account' : 'Sign In')}
					</button>
				</form>

				{/* Mode Switch Footer */}
				<div style={{ textAlign: 'center', marginTop: '20px' }}>
					{mode === 'signin' ? (
						<p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
							Don't have an account?{' '}
							<span
								onClick={() => { setMode('signup'); setError(null); setSuccessMsg(null); }}
								style={{ color: '#3b82f6', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
							>
								Create one here
							</span>
						</p>
					) : (
						<p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
							Already have an account?{' '}
							<span
								onClick={() => { setMode('signin'); setError(null); setSuccessMsg(null); }}
								style={{ color: '#3b82f6', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}
							>
								Sign in here
							</span>
						</p>
					)}
				</div>
			</div>
		</div>
	);
};
