/**
 * Handles legacy tool call markup in model outputs:
 * 1. XML style: `<tool_call tool="Write">{"file_path":"test"}</tool_call>`
 * 2. Hermès / Liquid / LFM style: `<|tool_call_start|>[Write(file_path='test', content='')]<|tool_call_end|>`
 *
 * Extracts tool calls for agent execution and strips markup from assistant text.
 */

import { randomUUID } from 'node:crypto';

const TOOL_CALL_OPEN = '<tool_call tool="';
const TOOL_CALL_CLOSE = '</tool_call>';

const HERMES_CALL_OPEN = '<|tool_call_start|>';
const HERMES_CALL_CLOSE = '<|tool_call_end|>';

export type LegacyToolCallFromText = {
	id: string;
	name: string;
	arguments: string;
};

function skipJsonObject(s: string, i: number): number {
	if (s[i] !== '{') return -1;
	let depth = 0;
	let state: 'normal' | 'string' | 'escape' = 'normal';
	for (let p = i; p < s.length; p++) {
		const ch = s[p]!;
		if (state === 'escape') {
			state = 'string';
			continue;
		}
		if (state === 'string') {
			if (ch === '\\') state = 'escape';
			else if (ch === '"') state = 'normal';
			continue;
		}
		if (ch === '"') {
			state = 'string';
			continue;
		}
		if (ch === '{') depth++;
		else if (ch === '}') {
			depth--;
			if (depth === 0) return p + 1;
		}
	}
	return -1;
}

function parseToolCallHeader(
	content: string,
	absStart: number
): { name: string; jsonStart: number } | null {
	if (!content.startsWith(TOOL_CALL_OPEN, absStart)) return null;
	const nameStart = absStart + TOOL_CALL_OPEN.length;
	const nameQuote = content.indexOf('"', nameStart);
	if (nameQuote === -1) return null;
	const name = content.slice(nameStart, nameQuote);
	let pos = nameQuote + 1;
	while (pos < content.length && /\s/.test(content[pos]!)) pos++;
	while (pos < content.length && content[pos] !== '>') {
		if (content.startsWith('sub_parent="', pos)) {
			pos += 'sub_parent="'.length;
			const eq = content.indexOf('"', pos);
			if (eq === -1) return null;
			pos = eq + 1;
			while (pos < content.length && /\s/.test(content[pos]!)) pos++;
			continue;
		}
		if (content.startsWith('sub_depth="', pos)) {
			pos += 'sub_depth="'.length;
			const eq = content.indexOf('"', pos);
			if (eq === -1) return null;
			pos = eq + 1;
			while (pos < content.length && /\s/.test(content[pos]!)) pos++;
			continue;
		}
		return null;
	}
	if (pos >= content.length || content[pos] !== '>') return null;
	return { name, jsonStart: pos + 1 };
}

function parseHermesToolCall(text: string, startIndex: number): {
	name: string;
	arguments: string;
	endIndex: number;
} | null {
	if (!text.startsWith(HERMES_CALL_OPEN, startIndex)) return null;
	const closeIdx = text.indexOf(HERMES_CALL_CLOSE, startIndex + HERMES_CALL_OPEN.length);
	if (closeIdx === -1) return null;

	const body = text.slice(startIndex + HERMES_CALL_OPEN.length, closeIdx).trim();
	const m = body.match(/^\[?\s*([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\)\s*\]?$/);
	if (!m) return null;

	const name = m[1]!;
	const rawArgs = m[2]!.trim();

	if (rawArgs.startsWith('{') && rawArgs.endsWith('}')) {
		try {
			JSON.parse(rawArgs);
			return { name, arguments: rawArgs, endIndex: closeIdx + HERMES_CALL_CLOSE.length };
		} catch {
			/* fallback to kwarg parse */
		}
	}

	const argsObj: Record<string, unknown> = {};
	const kwargRegex = /([a-zA-Z0-9_]+)\s*=\s*(?:'([^']*)'|"([^"]*)"|([^\s,]+))/g;
	let match: RegExpExecArray | null;
	while ((match = kwargRegex.exec(rawArgs)) !== null) {
		const key = match[1]!;
		const val = match[2] !== undefined ? match[2] : match[3] !== undefined ? match[3] : match[4];
		argsObj[key] = val;
	}

	return {
		name,
		arguments: JSON.stringify(argsObj),
		endIndex: closeIdx + HERMES_CALL_CLOSE.length,
	};
}

/**
 * Extracts full `<tool_call>` or `<|tool_call_start|>` blocks from assistant text.
 * Returns stripped text and executable tool_calls.
 */
export function extractLegacyToolCallsFromAssistantText(
	text: string,
	idPrefix = 'legacy_tc_'
): { text: string; toolCalls: LegacyToolCallFromText[] } {
	if (!text.includes(TOOL_CALL_OPEN) && !text.includes(HERMES_CALL_OPEN)) {
		return { text, toolCalls: [] };
	}

	const toolCalls: LegacyToolCallFromText[] = [];
	const removeRanges: Array<{ start: number; end: number }> = [];
	let from = 0;

	while (from < text.length) {
		const xmlStart = text.indexOf(TOOL_CALL_OPEN, from);
		const hermesStart = text.indexOf(HERMES_CALL_OPEN, from);

		if (xmlStart === -1 && hermesStart === -1) break;

		if (hermesStart !== -1 && (xmlStart === -1 || hermesStart < xmlStart)) {
			const hermesCall = parseHermesToolCall(text, hermesStart);
			if (hermesCall) {
				toolCalls.push({
					id: `${idPrefix}${toolCalls.length}_${randomUUID()}`,
					name: hermesCall.name,
					arguments: hermesCall.arguments,
				});
				removeRanges.push({ start: hermesStart, end: hermesCall.endIndex });
				from = hermesCall.endIndex;
				continue;
			} else {
				from = hermesStart + HERMES_CALL_OPEN.length;
				continue;
			}
		}

		const start = xmlStart;
		const hdr = parseToolCallHeader(text, start);
		if (!hdr) {
			from = start + TOOL_CALL_OPEN.length;
			continue;
		}
		const jsonEnd = skipJsonObject(text, hdr.jsonStart);
		if (jsonEnd === -1) {
			from = start + TOOL_CALL_OPEN.length;
			continue;
		}
		const closeIdx = text.indexOf(TOOL_CALL_CLOSE, jsonEnd);
		if (closeIdx === -1) {
			from = jsonEnd;
			continue;
		}
		const argsRaw = text.slice(hdr.jsonStart, jsonEnd);
		try {
			JSON.parse(argsRaw || '{}');
		} catch {
			from = closeIdx + TOOL_CALL_CLOSE.length;
			continue;
		}
		toolCalls.push({
			id: `${idPrefix}${toolCalls.length}_${randomUUID()}`,
			name: hdr.name,
			arguments: argsRaw || '{}',
		});
		removeRanges.push({ start, end: closeIdx + TOOL_CALL_CLOSE.length });
		from = closeIdx + TOOL_CALL_CLOSE.length;
	}

	if (removeRanges.length === 0) {
		return { text, toolCalls: [] };
	}

	let cleaned = text;
	for (let i = removeRanges.length - 1; i >= 0; i--) {
		const r = removeRanges[i]!;
		cleaned = cleaned.slice(0, r.start) + cleaned.slice(r.end);
	}
	return { text: cleaned, toolCalls };
}

/** Strips all legacy tool_call markup without executing. */
export function stripLegacyToolCallMarkup(text: string): string {
	return extractLegacyToolCallsFromAssistantText(text).text;
}

const PARTIAL_TOOL_CALL_PREFIXES = [
	'<',
	'<t',
	'<to',
	'<too',
	'<tool',
	'<tool_',
	'<tool_c',
	'<tool_ca',
	'<tool_cal',
	'<tool_call',
	'<tool_call ',
	'<tool_call t',
	'<tool_call to',
	'<tool_call too',
	'<tool_call tool',
	'<tool_call tool=',
	'<tool_call tool="',
	'<|',
	'<|t',
	'<|to',
	'<|too',
	'<|tool',
	'<|tool_',
	'<|tool_c',
	'<|tool_ca',
	'<|tool_cal',
	'<|tool_call',
	'<|tool_call_',
	'<|tool_call_s',
	'<|tool_call_st',
	'<|tool_call_sta',
	'<|tool_call_star',
	'<|tool_call_start',
	'<|tool_call_start|',
	'<|tool_call_start|>',
];

function trailingPartialToolCallPrefix(s: string): string {
	for (let len = PARTIAL_TOOL_CALL_PREFIXES.length - 1; len >= 0; len--) {
		const p = PARTIAL_TOOL_CALL_PREFIXES[len]!;
		if (s.endsWith(p)) return p;
	}
	return '';
}

/**
 * Stream filter: suppresses tool call tokens during streaming, parses them on completion.
 */
export function createLegacyToolCallStreamFilter(idPrefix = 'legacy_tc_') {
	let pending = '';
	const toolCalls: LegacyToolCallFromText[] = [];

	const feed = (chunk: string): string => {
		if (!chunk) return '';
		pending += chunk;
		let visible = '';

		while (pending.length > 0) {
			const xmlStart = pending.indexOf(TOOL_CALL_OPEN);
			const hermesStart = pending.indexOf(HERMES_CALL_OPEN);

			if (xmlStart === -1 && hermesStart === -1) {
				const partial = trailingPartialToolCallPrefix(pending);
				visible += pending.slice(0, pending.length - partial.length);
				pending = partial;
				break;
			}

			if (hermesStart !== -1 && (xmlStart === -1 || hermesStart < xmlStart)) {
				visible += pending.slice(0, hermesStart);
				pending = pending.slice(hermesStart);

				const hermesCall = parseHermesToolCall(pending, 0);
				if (!hermesCall) {
					// Wait for stream to complete or close tag
					break;
				}
				toolCalls.push({
					id: `${idPrefix}${toolCalls.length}_${randomUUID()}`,
					name: hermesCall.name,
					arguments: hermesCall.arguments,
				});
				pending = pending.slice(hermesCall.endIndex);
				continue;
			}

			visible += pending.slice(0, xmlStart);
			pending = pending.slice(xmlStart);

			const hdr = parseToolCallHeader(pending, 0);
			if (!hdr) {
				const partial = trailingPartialToolCallPrefix(pending);
				if (partial) {
					pending = partial;
				}
				break;
			}
			const jsonEnd = skipJsonObject(pending, hdr.jsonStart);
			if (jsonEnd === -1) break;
			const closeIdx = pending.indexOf(TOOL_CALL_CLOSE, jsonEnd);
			if (closeIdx === -1) break;

			const argsRaw = pending.slice(hdr.jsonStart, jsonEnd);
			try {
				JSON.parse(argsRaw || '{}');
			} catch {
				pending = pending.slice(closeIdx + TOOL_CALL_CLOSE.length);
				continue;
			}

			toolCalls.push({
				id: `${idPrefix}${toolCalls.length}_${randomUUID()}`,
				name: hdr.name,
				arguments: argsRaw || '{}',
			});
			pending = pending.slice(closeIdx + TOOL_CALL_CLOSE.length);
		}

		return visible;
	};

	const finish = (): string => {
		const extracted = extractLegacyToolCallsFromAssistantText(pending, idPrefix);
		for (const tc of extracted.toolCalls) {
			toolCalls.push(tc);
		}
		pending = '';
		return extracted.text;
	};

	return { feed, finish, get toolCalls() { return toolCalls; } };
}
