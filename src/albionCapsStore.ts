import { useSyncExternalStore } from 'react';
import { getAlbionProxyUrl } from './albionConfig';
import type { UserCapsResponse } from './albionFreeTier';

interface CapsState {
	data: UserCapsResponse | null;
	loading: boolean;
	error: string | null;
	token: string | null;
}

const listeners = new Set<() => void>();
let state: CapsState = {
	data: null,
	loading: false,
	error: null,
	token: null,
};
let inFlight: Promise<void> | null = null;

function emit(next: CapsState) {
	state = next;
	for (const listener of listeners) listener();
}

async function resolveToken(): Promise<string> {
	if (state.token) return state.token;
	if (typeof window !== 'undefined' && window.asyncShell?.invoke) {
		try {
			const res = (await window.asyncShell.invoke('albion:auth:get')) as
				| { ok?: boolean; token?: string }
				| undefined;
			if (res?.ok && res.token) {
				emit({ ...state, token: res.token });
				return res.token;
			}
		} catch {
			/* ignore shell auth errors */
		}
	}
	return '';
}

export function subscribeAlbionCaps(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function getAlbionCapsSnapshot(): CapsState {
	return state;
}

export function setAlbionCapsToken(token: string | null): void {
	if (state.token === token) return;
	emit({ ...state, token });
}

export async function refreshAlbionCaps(): Promise<void> {
	if (inFlight) return inFlight;

	inFlight = (async () => {
		emit({ ...state, loading: true, error: null });
		try {
			const token = await resolveToken();
			const res = await fetch(`${getAlbionProxyUrl()}/api/user/caps`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!res.ok) {
				emit({ ...state, loading: false, error: `HTTP ${res.status}` });
				return;
			}
			const data = (await res.json()) as UserCapsResponse;
			emit({ ...state, data, loading: false, error: null });
		} catch (err) {
			emit({
				...state,
				loading: false,
				error: err instanceof Error ? err.message : 'Failed to load usage',
			});
		} finally {
			inFlight = null;
		}
	})();

	return inFlight;
}

export function useAlbionCaps(): CapsState {
	return useSyncExternalStore(subscribeAlbionCaps, getAlbionCapsSnapshot, getAlbionCapsSnapshot);
}
