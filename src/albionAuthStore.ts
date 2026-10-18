/**
 * Albion Global Auth Store
 * Single source of truth for auth state across all layouts.
 * Uses a simple pub/sub pattern to avoid Zustand dependency.
 */

export type AlbionUser = {
	id: string;
	email?: string;
	tier?: 'free' | 'learner' | 'starter' | 'pro';
};

export type AlbionAuthState = {
	isAuthenticated: boolean;
	token: string | null;
	user: AlbionUser | null;
};

type AuthListener = (state: AlbionAuthState) => void;

const listeners = new Set<AuthListener>();

let _state: AlbionAuthState = {
	isAuthenticated: false,
	token: null,
	user: null,
};

export function getAlbionAuthState(): AlbionAuthState {
	return _state;
}

export function setAlbionAuthState(next: AlbionAuthState): void {
	_state = next;
	for (const listener of listeners) {
		try {
			listener(_state);
		} catch {
			/* ignore listener errors */
		}
	}
}

export function subscribeAlbionAuth(listener: AuthListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

/**
 * Sign in: sets auth state with token and user info.
 */
export function albionSignIn(token: string, user: AlbionUser): void {
	setAlbionAuthState({ isAuthenticated: true, token, user });
}

/**
 * Sign out: clears all auth state and user-specific data.
 * Also clears any per-user localStorage keys to prevent state leakage.
 */
export function albionSignOut(): void {
	setAlbionAuthState({ isAuthenticated: false, token: null, user: null });
	// Clear user-specific localStorage to prevent state leakage between accounts
	try {
		const keysToPreserve = ['async:initial-window-theme-v1'];
		const allKeys: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const k = localStorage.key(i);
			if (k) allKeys.push(k);
		}
		for (const k of allKeys) {
			if (!keysToPreserve.includes(k)) {
				try { localStorage.removeItem(k); } catch { /* ignore */ }
			}
		}
	} catch {
		/* ignore storage errors */
	}
}

import { useState, useEffect } from 'react';

/**
 * React hook to subscribe to global Albion auth state.
 * Any layout or view calling this hook will immediately re-render on auth changes.
 */
export function useAlbionAuth(): AlbionAuthState {
	const [state, setState] = useState<AlbionAuthState>(getAlbionAuthState);
	useEffect(() => {
		return subscribeAlbionAuth(setState);
	}, []);
	return state;
}
