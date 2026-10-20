import { describe, expect, it } from 'vitest';
import { clampSidebarLayout, readStoredShellLayoutModeFromKey } from './shellLayoutStorage';

describe('shellLayoutStorage', () => {
	it('clampSidebarLayout keeps rails within min/max for a typical viewport', () => {
		const { left, right } = clampSidebarLayout(100, 100);
		expect(left).toBeGreaterThanOrEqual(200);
		expect(right).toBeGreaterThanOrEqual(340);
	});

	it('clampSidebarLayout lets the right rail grow until the center hits its minimum', () => {
		const { left, right } = clampSidebarLayout(200, 5000);
		expect(left).toBe(200);
		expect(right).toBe(1280 - 2 * 5 - 320 - left);
	});

	it('readStoredShellLayoutModeFromKey falls back to agent for missing key', () => {
		expect(readStoredShellLayoutModeFromKey('__void-shell-nonexistent-layout-key__')).toBe('agent');
	});
});
