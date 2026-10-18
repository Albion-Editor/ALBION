import { APIError as OpenAIAPIError } from 'openai';
import { APIError as AnthropicAPIError } from '@anthropic-ai/sdk';

function statusHintEn(status: number): string {
	if (status === 401 || status === 403) {
		return ' (Authentication failed. Please verify your credentials or session.)';
	}
	if (status === 402) {
		return ' (Payment required or balance exhausted.)';
	}
	if (status === 429) {
		return ' (Rate limit exceeded. Please wait a moment before retrying.)';
	}
	if (status >= 500 && status <= 599) {
		return ' (Server error. Please retry shortly.)';
	}
	return '';
}

function stringifyErrorBody(err: unknown): string {
	if (err == null) return '';
	if (typeof err === 'string') return err;
	try {
		const s = JSON.stringify(err);
		return s === '{}' ? '' : s;
	} catch {
		return String(err);
	}
}

/**
 * 将 OpenAI / Anthropic SDK 的 APIError 等格式化为可读字符串（含 HTTP 状态与响应体），便于 UI 与主进程日志排查。
 * On HTTP 402 or 429 from Albion proxy: parses JSON error body with cap exhausted / upgrade prompt.
 * On HTTP 503 from Albion proxy: extracts proxy upgrade message verbatim.
 */
export function formatLlmSdkError(e: unknown): string {
	if (e instanceof OpenAIAPIError || e instanceof AnthropicAPIError) {
		const status = e.status;
		const msg = (e.message ?? '').trim();
		const rawErr = e.error as Record<string, unknown> | undefined;

		// Extract JSON error message if returned by Albion proxy
		if (rawErr && typeof rawErr === 'object') {
			if (typeof rawErr.error === 'string') {
				return rawErr.error;
			}
			if (typeof rawErr.message === 'string') {
				return rawErr.message;
			}
		}

		if (status === 503 && msg) {
			return msg;
		}

		const body = stringifyErrorBody(e.error);
		if (typeof status === 'number') {
			const hint = statusHintEn(status);
			const head = `HTTP ${status}${hint}`;
			const parts = [head, msg, body].filter((p) => p.length > 0);
			// 避免 message 与 body 完全重复
			const out = parts.join(' ');
			return out.trim() || String(e);
		}
		return [msg, body].filter((p) => p.length > 0).join(' ') || String(e);
	}
	if (e instanceof Error) {
		return e.message || String(e);
	}
	return String(e);
}
