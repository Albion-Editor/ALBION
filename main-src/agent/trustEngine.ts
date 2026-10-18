/**
 * trustEngine.ts
 * Albion Trust Engine: Verification Hook & Shadow Path Verification
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { exec } from 'node:child_process';
import { writeTextFileAtomicSync, type TextEncoding } from '../textEncoding.js';

export interface TrustVerificationResult {
	testsRun: boolean;
	passed: boolean;
	failedCount: number;
	outputTail: string;
	testsPassed?: number;
}

export type TrustState = 'verified' | 'unverified' | 'failed';

const verificationStore = new Map<string, TrustVerificationResult>();
const retryTracker = new Map<string, number>();

export function recordVerification(relPath: string, result: TrustVerificationResult): void {
	const normalized = relPath.replace(/\\/g, '/');
	verificationStore.set(normalized, result);
}

export function getVerification(relPath: string): TrustVerificationResult | undefined {
	const normalized = relPath.replace(/\\/g, '/');
	return verificationStore.get(normalized);
}

export function clearVerifications(): void {
	verificationStore.clear();
	retryTracker.clear();
}

/**
 * Classifies trust evidence following Albion strict rules:
 * - Green Verified ONLY if testsRun === true AND passed === true.
 * - Yellow Unverified if testsRun === false.
 * - Red Blocked/Failed if testsRun === true AND passed === false.
 */
export function classifyTrustBadge(result?: TrustVerificationResult | null): {
	state: TrustState;
	text: string;
	color: string;
} {
	if (!result || result.testsRun === false) {
		return {
			state: 'unverified',
			text: 'Unverified (no tests found)',
			color: '#f59e0b', // Yellow
		};
	}

	if (result.testsRun === true && result.passed === true) {
		const passed = result.testsPassed ?? 1;
		return {
			state: 'verified',
			text: `Verified (${passed} test${passed === 1 ? '' : 's'} passed)`,
			color: '#10b981', // Green
		};
	}

	const failedCount = result.failedCount > 0 ? result.failedCount : 1;
	return {
		state: 'failed',
		text: `Blocked (${failedCount} test${failedCount === 1 ? '' : 's'} failed)`,
		color: '#ef4444', // Red
	};
}

function parsePassedTestCount(output: string): number {
	const m = output.match(/(\d+)\s+(?:passed|passing)/i) || output.match(/pass(?:ed)?\s*[:=]?\s*(\d+)/i);
	if (m && m[1]) {
		const n = parseInt(m[1], 10);
		if (!Number.isNaN(n) && n > 0) return n;
	}
	return 1;
}

function parseFailedTestCount(output: string): number {
	const m = output.match(/(\d+)\s+(?:failed|failing)/i) || output.match(/fail(?:ed)?\s*[:=]?\s*(\d+)/i);
	if (m && m[1]) {
		const n = parseInt(m[1], 10);
		if (!Number.isNaN(n) && n > 0) return n;
	}
	return 1;
}

export interface VerifyHookOptions {
	workspaceRoot: string;
	relPath: string;
	full: string;
	newContent: string;
	encoding: TextEncoding;
	previousContent: string | null;
	beforeWrite?: (meta: { path: string; previousContent: string | null }) => void;
	afterWrite?: (meta: { path: string; previousContent: string | null; nextContent: string }) => void;
}

export interface VerifyHookResult {
	success: boolean;
	verification: TrustVerificationResult;
	errorContext?: string;
	retryCount?: number;
	maxRetriesExceeded?: boolean;
}

export async function verifyAndApplyChange(options: VerifyHookOptions): Promise<VerifyHookResult> {
	const {
		workspaceRoot,
		relPath,
		full,
		newContent,
		encoding,
		previousContent,
		beforeWrite,
		afterWrite,
	} = options;

	const normalizedRel = relPath.replace(/\\/g, '/');
	const shadowDir = path.join(workspaceRoot, '.albion-shadow');
	const shadowPath = path.join(shadowDir, normalizedRel);

	// 1. Write content to shadow path (.albion-shadow/<relPath>)
	try {
		fs.mkdirSync(path.dirname(shadowPath), { recursive: true });
		fs.writeFileSync(shadowPath, newContent, 'utf8');
	} catch (e) {
		console.warn('[TRUST-ENGINE] Failed to write shadow file:', e);
	}

	// 2. Check if open project's package.json has a test script
	let hasTestScript = false;
	const pkgPath = path.join(workspaceRoot, 'package.json');
	if (fs.existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
			if (pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim()) {
				hasTestScript = true;
			}
		} catch (_) {}
	}

	// 3. If no tests found → apply write immediately but mark as UNVERIFIED
	if (!hasTestScript) {
		beforeWrite?.({ path: relPath, previousContent });
		writeTextFileAtomicSync(full, newContent, encoding);
		afterWrite?.({ path: relPath, previousContent, nextContent: newContent });

		const verification: TrustVerificationResult = {
			testsRun: false,
			passed: false,
			failedCount: 0,
			outputTail: 'No tests found in project package.json',
		};
		recordVerification(normalizedRel, verification);
		return { success: true, verification };
	}

	// 4. Tests found → run non-interactively with 60s timeout
	// Temporarily apply proposed write to workspace so tests can execute against it
	const existed = previousContent !== null;
	try {
		writeTextFileAtomicSync(full, newContent, encoding);
	} catch (e) {
		const verification: TrustVerificationResult = {
			testsRun: false,
			passed: false,
			failedCount: 0,
			outputTail: `Failed to stage file for test verification: ${String(e)}`,
		};
		recordVerification(normalizedRel, verification);
		return { success: false, verification, errorContext: String(e) };
	}

	// Non-blocking child_process.exec with 60s timeout
	const testResult = await new Promise<{ exitCode: number; output: string }>((resolve) => {
		const cmd = process.platform === 'win32' ? 'npm.cmd test' : 'npm test';
		exec(
			cmd,
			{
				cwd: workspaceRoot,
				timeout: 60000,
				env: { ...process.env, CI: 'true', npm_config_yes: 'true' },
			},
			(error, stdout, stderr) => {
				const output = `${stdout || ''}\n${stderr || ''}`.trim();
				const exitCode = error ? (error.code ?? 1) : 0;
				resolve({ exitCode, output });
			}
		);
	});

	const outputTail = testResult.output.slice(-2500);

	// 5. If tests ran and passed → commit write
	if (testResult.exitCode === 0) {
		beforeWrite?.({ path: relPath, previousContent });
		// Already in place, ensure atomic metadata write
		writeTextFileAtomicSync(full, newContent, encoding);
		afterWrite?.({ path: relPath, previousContent, nextContent: newContent });

		const testsPassed = parsePassedTestCount(testResult.output);
		const verification: TrustVerificationResult = {
			testsRun: true,
			passed: true,
			failedCount: 0,
			testsPassed,
			outputTail,
		};
		recordVerification(normalizedRel, verification);
		retryTracker.delete(normalizedRel);
		return { success: true, verification };
	}

	// 6. If tests ran and failed → revert real write, attach TEST_FAILURE_CONTEXT, max 2 retries
	if (existed && previousContent !== null) {
		writeTextFileAtomicSync(full, previousContent, encoding);
	} else if (!existed && fs.existsSync(full)) {
		try {
			fs.unlinkSync(full);
		} catch (_) {}
	}

	const failedCount = parseFailedTestCount(testResult.output);
	const verification: TrustVerificationResult = {
		testsRun: true,
		passed: false,
		failedCount,
		outputTail,
	};
	recordVerification(normalizedRel, verification);

	const currentRetries = retryTracker.get(normalizedRel) || 0;
	if (currentRetries < 2) {
		const nextRetry = currentRetries + 1;
		retryTracker.set(normalizedRel, nextRetry);
		return {
			success: false,
			verification,
			retryCount: nextRetry,
			maxRetriesExceeded: false,
			errorContext: `TEST_FAILURE_CONTEXT:\n${outputTail}`,
		};
	}

	retryTracker.delete(normalizedRel);
	return {
		success: false,
		verification,
		retryCount: currentRetries,
		maxRetriesExceeded: true,
		errorContext: `TEST_FAILURE_CONTEXT:\n${outputTail}`,
	};
}
