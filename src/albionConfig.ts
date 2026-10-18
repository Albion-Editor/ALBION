/**
 * Albion Production Environment Configuration
 * Centralized production endpoint configuration.
 */

// Production Railway backend URL
export const ALBION_PRODUCTION_PROXY_URL = 'https://albion-backend-production.up.railway.app';

// Production Website / Auth Redirect URL
export const ALBION_PRODUCTION_WEBSITE_URL = 'https://albionide.com';

/**
 * Returns the effective Albion Proxy URL.
 * Defaults to the production Railway backend URL unless an override is provided.
 */
export function getAlbionProxyUrl(): string {
	if (typeof process !== 'undefined' && process.env?.ALBION_PROXY_URL) {
		return process.env.ALBION_PROXY_URL;
	}
	if (typeof window !== 'undefined' && (window as unknown as { __ALBION_PROXY_URL__?: string }).__ALBION_PROXY_URL__) {
		return (window as unknown as { __ALBION_PROXY_URL__?: string }).__ALBION_PROXY_URL__!;
	}
	return ALBION_PRODUCTION_PROXY_URL;
}

/**
 * Returns the effective website redirect URL for OAuth and checkout.
 */
export function getAlbionWebsiteUrl(): string {
	return ALBION_PRODUCTION_WEBSITE_URL;
}
