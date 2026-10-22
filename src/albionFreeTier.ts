export const FREE_TIER_TOKEN_CAP = 200_000;
export const FREE_TIER_WARNING_PERCENT = 90;
export const BLENDED_COST_PER_MILLION_USD = 0.156;
export const USD_TO_NGN = 1370;

export interface ModelCapUsage {
	used: number;
	limit: number;
}

export interface UserCapsResponse {
	tier: string;
	caps?: Record<string, ModelCapUsage>;
	models?: Record<string, ModelCapUsage>;
	model?: string;
	lifetime_tokens?: number | null;
	lifetime_prompt_tokens?: number | null;
	lifetime_completion_tokens?: number | null;
	lifetime_cap?: number | null;
	lifetime_remaining?: number | null;
	lifetime_percent?: number | null;
	lifetime_locked?: boolean;
	lifetime_cost_usd?: number | null;
	lifetime_cost_ngn?: number | null;
	lifetime_resets?: boolean;
	resets_at?: string | null;
	reset_time?: string | null;
	daily_requests?: number;
	daily_tokens?: number;
	limit_requests?: number | null;
	limit_tokens?: number | null;
	cap_exceeded?: boolean;
}

export interface LifetimeStatus {
	used: number;
	cap: number;
	remaining: number;
	percent: number;
	locked: boolean;
	warning: boolean;
	costUsd: number;
	costNgn: number;
}

export function formatTokens(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return '0';
	if (n >= 1_000_000) {
		const f = (n / 1_000_000).toFixed(1);
		return f.endsWith('.0') ? `${Math.floor(n / 1_000_000)}M` : `${f}M`;
	}
	if (n >= 1000) {
		const f = (n / 1000).toFixed(1);
		return f.endsWith('.0') ? `${Math.round(n / 1000)}k` : `${f}k`;
	}
	return String(Math.round(n));
}

export function formatUsd(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '$0.00';
	if (value < 0.1) return `$${value.toFixed(4)}`;
	return `$${value.toFixed(2)}`;
}

export function formatNgn(value: number): string {
	if (!Number.isFinite(value) || value <= 0) return '₦0';
	return `₦${Math.round(value).toLocaleString('en-NG')}`;
}

export function computeBlendedCostUsd(tokens: number): number {
	const safe = Math.max(0, Number(tokens) || 0);
	return (safe / 1_000_000) * BLENDED_COST_PER_MILLION_USD;
}

export function getLifetimeStatus(data: UserCapsResponse | null | undefined): LifetimeStatus {
	const flash = data?.caps?.['deepseek-v4-flash'] ?? data?.models?.['deepseek-v4-flash'];
	const used = Math.max(
		0,
		Number(data?.lifetime_tokens ?? flash?.used ?? data?.daily_tokens ?? 0) || 0,
	);
	const cap = Math.max(1, Number(data?.lifetime_cap ?? flash?.limit ?? FREE_TIER_TOKEN_CAP) || FREE_TIER_TOKEN_CAP);
	const remaining = Math.max(0, Number(data?.lifetime_remaining ?? cap - used) || 0);
	const percent = Math.min(
		100,
		Math.max(0, Number(data?.lifetime_percent ?? (used / cap) * 100) || 0),
	);
	const locked = Boolean(data?.lifetime_locked ?? data?.cap_exceeded ?? used >= cap);
	const costUsd = Math.max(
		0,
		Number(data?.lifetime_cost_usd ?? computeBlendedCostUsd(used)) || 0,
	);
	const costNgn = Math.max(0, Number(data?.lifetime_cost_ngn ?? costUsd * USD_TO_NGN) || 0);
	return {
		used,
		cap,
		remaining,
		percent,
		locked,
		warning: !locked && percent >= FREE_TIER_WARNING_PERCENT,
		costUsd,
		costNgn,
	};
}
