export interface ModelPricingItem {
	model: string;
	cost_per_1k: number;
	currency: string;
}

let cachedPricing: Record<string, ModelPricingItem> | null = null;
let fetchPromise: Promise<Record<string, ModelPricingItem>> | null = null;

export async function fetchAlbionPricing(): Promise<Record<string, ModelPricingItem>> {
	if (cachedPricing) {
		return cachedPricing;
	}
	if (fetchPromise) {
		return fetchPromise;
	}

	fetchPromise = (async () => {
		try {
			let token = '';
			if (typeof window !== 'undefined' && window.asyncShell?.invoke) {
				const auth = (await window.asyncShell.invoke('albion:auth:get')) as
					| { ok?: boolean; token?: string }
					| undefined;
				if (auth?.ok && auth.token) {
					token = auth.token;
				}
			}

			const proxyUrl = process.env.ALBION_PROXY_URL || 'https://albion-backend-production-a88e.up.railway.app';
			const res = await fetch(`${proxyUrl}/api/pricing`, {
				headers: token ? { Authorization: `Bearer ${token}` } : {},
			});
			if (!res.ok) {
				throw new Error(`HTTP ${res.status}`);
			}
			const list = (await res.json()) as ModelPricingItem[];
			const map: Record<string, ModelPricingItem> = {};
			for (const item of list) {
				map[item.model] = item;
			}
			cachedPricing = map;
			return map;
		} catch (e) {
			console.warn('[ALBION] Failed to fetch live pricing, using default seed fallback:', e);
			cachedPricing = {
				'deepseek-v4-flash': { model: 'deepseek-v4-flash', cost_per_1k: 0.000156, currency: 'USD' },
				'qwen3.6-35b-a3b': { model: 'qwen3.6-35b-a3b', cost_per_1k: 0.00025, currency: 'USD' },
				'deepseek-v4-pro': { model: 'deepseek-v4-pro', cost_per_1k: 0.00219, currency: 'USD' },
				'glm-5.2': { model: 'glm-5.2', cost_per_1k: 0.00175, currency: 'USD' },
			};
			return cachedPricing;
		} finally {
			fetchPromise = null;
		}
	})();

	return fetchPromise;
}

export function getCachedAlbionPricing(): Record<string, ModelPricingItem> | null {
	return cachedPricing;
}
