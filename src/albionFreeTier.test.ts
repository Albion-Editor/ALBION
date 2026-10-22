import { describe, expect, it } from 'vitest';
import {
	FREE_TIER_TOKEN_CAP,
	computeBlendedCostUsd,
	formatTokens,
	formatUsd,
	getLifetimeStatus,
} from './albionFreeTier';

describe('albionFreeTier', () => {
	it('formats lifetime token counts', () => {
		expect(FREE_TIER_TOKEN_CAP).toBe(200_000);
		expect(formatTokens(200_000)).toBe('200k');
		expect(formatTokens(1_500_000)).toBe('1.5M');
		expect(formatTokens(0)).toBe('0');
	});

	it('computes the blended flash cost', () => {
		expect(computeBlendedCostUsd(200_000)).toBeCloseTo(0.0312, 6);
		expect(formatUsd(0.0312)).toBe('$0.0312');
	});

	it('derives lifetime status from the caps payload', () => {
		const status = getLifetimeStatus({
			tier: 'free',
			caps: { 'deepseek-v4-flash': { used: 180_000, limit: 200_000 } },
			lifetime_tokens: 180_000,
			lifetime_cap: 200_000,
			lifetime_remaining: 20_000,
			lifetime_percent: 90,
			lifetime_cost_usd: 0.02808,
			lifetime_locked: false,
		});
		expect(status.used).toBe(180_000);
		expect(status.remaining).toBe(20_000);
		expect(status.percent).toBe(90);
		expect(status.warning).toBe(true);
		expect(status.locked).toBe(false);
		expect(status.costNgn).toBeGreaterThan(0);
	});

	it('locks at and beyond the lifetime cap', () => {
		const status = getLifetimeStatus({
			tier: 'free',
			lifetime_tokens: 200_000,
			lifetime_cap: 200_000,
			lifetime_remaining: 0,
			lifetime_percent: 100,
			lifetime_locked: true,
		});
		expect(status.locked).toBe(true);
		expect(status.warning).toBe(false);
		expect(status.remaining).toBe(0);
	});

	it('falls back to the 200k cap when fields are missing', () => {
		const status = getLifetimeStatus({ tier: 'free' });
		expect(status.cap).toBe(FREE_TIER_TOKEN_CAP);
		expect(status.used).toBe(0);
		expect(status.locked).toBe(false);
	});
});
