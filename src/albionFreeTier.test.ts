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
		expect(FREE_TIER_TOKEN_CAP).toBe(100_000);
		expect(formatTokens(100_000)).toBe('100k');
		expect(formatTokens(1_500_000)).toBe('1.5M');
		expect(formatTokens(0)).toBe('0');
	});

	it('computes the blended flash cost', () => {
		expect(computeBlendedCostUsd(100_000)).toBeCloseTo(0.0156, 6);
		expect(formatUsd(0.0156)).toBe('$0.0156');
	});

	it('derives lifetime status from the caps payload', () => {
		const status = getLifetimeStatus({
			tier: 'free',
			caps: { 'deepseek-v4-flash': { used: 90_000, limit: 100_000 } },
			lifetime_tokens: 90_000,
			lifetime_cap: 100_000,
			lifetime_remaining: 10_000,
			lifetime_percent: 90,
			lifetime_cost_usd: 0.01404,
			lifetime_locked: false,
		});
		expect(status.used).toBe(90_000);
		expect(status.remaining).toBe(10_000);
		expect(status.percent).toBe(90);
		expect(status.warning).toBe(true);
		expect(status.locked).toBe(false);
		expect(status.costNgn).toBeGreaterThan(0);
	});

	it('locks at and beyond the lifetime cap', () => {
		const status = getLifetimeStatus({
			tier: 'free',
			lifetime_tokens: 100_000,
			lifetime_cap: 100_000,
			lifetime_remaining: 0,
			lifetime_percent: 100,
			lifetime_locked: true,
		});
		expect(status.locked).toBe(true);
		expect(status.warning).toBe(false);
		expect(status.remaining).toBe(0);
	});

	it('falls back to the 100k cap when fields are missing', () => {
		const status = getLifetimeStatus({ tier: 'free' });
		expect(status.cap).toBe(FREE_TIER_TOKEN_CAP);
		expect(status.used).toBe(0);
		expect(status.locked).toBe(false);
	});
});
