import { app, safeStorage } from 'electron';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import type { OpenAIClientOptions } from './providerIdentity.js';

export const ALBION_PROXY_BASE_URL =
	process.env.ALBION_PROXY_URL?.trim() || 'https://albion-backend-production-a88e.up.railway.app';
export const ALBION_CLIENT_HEADER = 'albion-ide';

type AlbionAuthStore = {
	access_token?: string;
	user?: {
		id: string;
		email?: string;
	};
};

function getAuthFilePath(): string {
	const baseDir = app?.getPath ? app.getPath('userData') : process.cwd();
	const albionPath = path.join(baseDir, 'albion', 'albion-auth.json');
	if (existsSync(albionPath)) return albionPath;
	const legacyPath = path.join(baseDir, 'async', 'albion-auth.json');
	if (existsSync(legacyPath)) return legacyPath;
	return albionPath;
}

export function saveAlbionToken(token: string, user?: { id: string; email?: string }): void {
	const filePath = getAuthFilePath();
	mkdirSync(path.dirname(filePath), { recursive: true });

	let encoded = '';
	try {
		if (safeStorage && safeStorage.isEncryptionAvailable()) {
			encoded = `safe:${safeStorage.encryptString(token).toString('base64')}`;
		}
	} catch {
		/* fallback to plain */
	}

	if (!encoded) {
		encoded = `plain:${Buffer.from(token, 'utf8').toString('base64')}`;
	}

	const store: AlbionAuthStore = {
		access_token: encoded,
		user,
	};
	writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');
}

export function getAlbionToken(): string | null {
	const filePath = getAuthFilePath();
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		const raw = JSON.parse(readFileSync(filePath, 'utf8')) as AlbionAuthStore;
		const encoded = raw.access_token;
		if (!encoded) return null;

		if (encoded.startsWith('safe:')) {
			const buf = Buffer.from(encoded.slice(5), 'base64');
			return safeStorage.decryptString(buf);
		}
		if (encoded.startsWith('plain:')) {
			return Buffer.from(encoded.slice(6), 'base64').toString('utf8');
		}
		return Buffer.from(encoded, 'base64').toString('utf8');
	} catch {
		return null;
	}
}

export function getAlbionUser(): { id: string; email?: string } | null {
	const filePath = getAuthFilePath();
	if (!existsSync(filePath)) {
		return null;
	}
	try {
		const raw = JSON.parse(readFileSync(filePath, 'utf8')) as AlbionAuthStore;
		return raw.user ?? null;
	} catch {
		return null;
	}
}

export function clearAlbionToken(): void {
	const filePath = getAuthFilePath();
	if (existsSync(filePath)) {
		try {
			writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
		} catch {
			/* ignore */
		}
	}
}

let activeForcedModel: string | null = null;

export function setAlbionForceModel(model: string | null): void {
	activeForcedModel = model;
}

export function getAlbionForceModel(): string | null {
	return activeForcedModel;
}

/**
 * Single source of truth for constructing Albion-compliant OpenAI client options.
 * Directs baseURL to albion-proxy, attaches Authorization Bearer <supabase jwt>,
 * X-Albion-Client header, and X-Albion-Force-Model when present.
 */
export function applyAlbionTransport(
	baseOptions: OpenAIClientOptions,
	forceModel?: string | null
): OpenAIClientOptions {
	const token = getAlbionToken() || '';
	const modelToForce = forceModel !== undefined ? forceModel : getAlbionForceModel();

	const albionHeaders: Record<string, string> = {
		'X-Albion-Client': ALBION_CLIENT_HEADER,
		Authorization: `Bearer ${token}`,
	};

	if (modelToForce) {
		albionHeaders['X-Albion-Force-Model'] = modelToForce;
	}

	const existingHeaders = (baseOptions.defaultHeaders || {}) as Record<string, string>;

	return {
		...baseOptions,
		baseURL: `${ALBION_PROXY_BASE_URL}/v1`,
		apiKey: token || 'albion-token-placeholder',
		defaultHeaders: {
			...existingHeaders,
			...albionHeaders,
		},
	};
}
