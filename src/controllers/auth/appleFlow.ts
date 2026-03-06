import { randomUUID } from 'crypto';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../../lib/logger';

export type AppleFlowLevel = 'info' | 'warn' | 'error';
export type AppleFlowStatus = 'processing' | 'success' | 'signup_required' | 'error';

export interface AppleFlowEvent {
	at: string;
	level: AppleFlowLevel;
	code: string;
	message: string;
	details?: Record<string, unknown>;
}

export interface AppleFlowTrace {
	traceId: string;
	provider: 'apple';
	startedAt: string;
	updatedAt: string;
	status: AppleFlowStatus;
	outcomeCode?: string;
	summary?: string;
	events: AppleFlowEvent[];
}

interface AppleTraceRequest extends Request {
	appleFlowTrace?: AppleFlowTrace;
}

export const APPLE_TRACE_COOKIE = '__apple_oauth_trace';
export const APPLE_NONCE_COOKIE = '__apple_oauth_nonce';

const MAX_STRING_LENGTH = 180;
const MAX_COLLECTION_ITEMS = 12;

function getAppleTraceRequest(req: Request): AppleTraceRequest {
	return req as AppleTraceRequest;
}

function safeStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function truncateString(value: string, maxLength = MAX_STRING_LENGTH): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
}

function summarizeSecret(value: string): Record<string, unknown> {
	return {
		redacted: true,
		length: value.length,
		previewStart: value.slice(0, 6),
		previewEnd: value.slice(-4),
	};
}

function summarizeJwt(token: string): Record<string, unknown> {
	const decoded = jwt.decode(token);
	const claims =
		decoded && typeof decoded === 'object'
			? sanitizeFlowDetails(decoded as Record<string, unknown>)
			: decoded ?? null;

	return {
		redacted: true,
		length: token.length,
		previewStart: token.slice(0, 10),
		previewEnd: token.slice(-6),
		claims,
	};
}

function sanitizeValue(value: unknown, keyHint?: string, depth = 0): unknown {
	if (value === null || value === undefined) return value;
	if (depth > 4) return '[max-depth-reached]';

	const normalizedKey = keyHint?.toLowerCase();

	if (typeof value === 'string') {
		if (normalizedKey === 'id_token') return summarizeJwt(value);
		if (
			normalizedKey === 'code' ||
			normalizedKey === 'state' ||
			normalizedKey === 'access_token' ||
			normalizedKey === 'refresh_token' ||
			normalizedKey === 'authorization'
		) {
			return summarizeSecret(value);
		}
		if (normalizedKey === 'user') {
			try {
				const parsed = JSON.parse(value) as Record<string, unknown>;
				return sanitizeFlowDetails(parsed, depth + 1);
			} catch {
				return truncateString(value);
			}
		}
		return truncateString(value);
	}

	if (typeof value === 'number' || typeof value === 'boolean') return value;

	if (Array.isArray(value)) {
		return value.slice(0, MAX_COLLECTION_ITEMS).map((item) => sanitizeValue(item, undefined, depth + 1));
	}

	if (typeof value === 'object') {
		return sanitizeFlowDetails(value as Record<string, unknown>, depth + 1);
	}

	return String(value);
}

export function sanitizeFlowDetails(
	details: Record<string, unknown> | undefined,
	depth = 0
): Record<string, unknown> | undefined {
	if (!details) return undefined;

	const sanitizedEntries = Object.entries(details)
		.slice(0, MAX_COLLECTION_ITEMS)
		.map(([key, value]) => [key, sanitizeValue(value, key, depth)]);

	return Object.fromEntries(sanitizedEntries);
}

export function sanitizeApplePayload(payload: Record<string, unknown> | null | undefined): Record<string, unknown> {
	if (!payload || typeof payload !== 'object') return {};
	return sanitizeFlowDetails(payload) ?? {};
}

function createTrace(): AppleFlowTrace {
	const now = new Date().toISOString();
	return {
		traceId: randomUUID(),
		provider: 'apple',
		startedAt: now,
		updatedAt: now,
		status: 'processing',
		events: [],
	};
}

function decodeTrace(rawCookieValue: string | undefined): AppleFlowTrace | null {
	if (!rawCookieValue) return null;

	try {
		const decoded = JSON.parse(Buffer.from(rawCookieValue, 'base64url').toString('utf8')) as AppleFlowTrace;
		if (
			typeof decoded?.traceId === 'string' &&
			decoded.provider === 'apple' &&
			typeof decoded.startedAt === 'string' &&
			Array.isArray(decoded.events)
		) {
			return {
				...decoded,
				status: decoded.status ?? 'processing',
				updatedAt: decoded.updatedAt ?? decoded.startedAt,
			};
		}
	} catch {
		return null;
	}

	return null;
}

function getTraceCookieOptions(req: Request) {
	const forwardedProto = req.headers['x-forwarded-proto'];
	const normalizedProto = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
	const host = req.headers.host ?? '';
	const isLocalHost =
		host.startsWith('localhost:') ||
		host === 'localhost' ||
		host.startsWith('127.0.0.1:') ||
		host === '127.0.0.1';
	const secure = req.secure || normalizedProto === 'https' || isLocalHost;

	return {
		httpOnly: true,
		secure,
		sameSite: 'none' as const,
		maxAge: 15 * 60 * 1000,
		path: '/',
	};
}

export function getAppleCookieTransportOptions(req: Request) {
	return getTraceCookieOptions(req);
}

export function persistAppleNonce(req: Request, nonce: string): void {
	const res = req.res;
	if (!res?.cookie) return;

	res.cookie(APPLE_NONCE_COOKIE, nonce, getTraceCookieOptions(req));
}

export function clearAppleNonce(req: Request): void {
	const res = req.res;
	if (!res?.clearCookie) return;

	res.clearCookie(APPLE_NONCE_COOKIE, getTraceCookieOptions(req));
}

export function getAppleFlowTrace(req: Request): AppleFlowTrace {
	const traceReq = getAppleTraceRequest(req);
	if (traceReq.appleFlowTrace) return traceReq.appleFlowTrace;

	const cookieValue =
		typeof req.cookies?.[APPLE_TRACE_COOKIE] === 'string' ? (req.cookies[APPLE_TRACE_COOKIE] as string) : undefined;
	const hydrated = decodeTrace(cookieValue);

	traceReq.appleFlowTrace = hydrated ?? createTrace();
	return traceReq.appleFlowTrace;
}

export function setAppleFlowTrace(req: Request, trace: AppleFlowTrace): AppleFlowTrace {
	const normalizedTrace: AppleFlowTrace = {
		...trace,
		provider: 'apple',
		events: Array.isArray(trace.events) ? trace.events : [],
		status: trace.status ?? 'processing',
		updatedAt: trace.updatedAt ?? new Date().toISOString(),
	};
	getAppleTraceRequest(req).appleFlowTrace = normalizedTrace;
	return normalizedTrace;
}

export function persistAppleFlowTrace(req: Request): void {
	const trace = getAppleFlowTrace(req);
	trace.updatedAt = new Date().toISOString();

	const res = req.res;
	if (!res?.cookie) return;

	try {
		res.cookie(
			APPLE_TRACE_COOKIE,
			Buffer.from(safeStringify(trace)).toString('base64url'),
			getTraceCookieOptions(req)
		);
	} catch (error) {
		logger.warn('Failed to persist Apple flow trace cookie', {
			traceId: trace.traceId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

export function clearAppleFlowTrace(req: Request): void {
	const res = req.res;
	if (!res?.clearCookie) return;

	res.clearCookie(APPLE_TRACE_COOKIE, getTraceCookieOptions(req));
}

export function recordAppleFlowEvent(
	req: Request,
	level: AppleFlowLevel,
	code: string,
	message: string,
	details?: Record<string, unknown>
): AppleFlowTrace {
	const trace = getAppleFlowTrace(req);
	const sanitizedDetails = sanitizeFlowDetails(details);
	trace.updatedAt = new Date().toISOString();
	trace.events.push({
		at: trace.updatedAt,
		level,
		code,
		message,
		...(sanitizedDetails ? { details: sanitizedDetails } : {}),
	});

	logger.log(level, `Apple flow: ${message}`, {
		traceId: trace.traceId,
		code,
		...(sanitizedDetails ? { details: sanitizedDetails } : {}),
	});

	return trace;
}

export function finalizeAppleFlow(
	req: Request,
	status: AppleFlowStatus,
	outcomeCode: string,
	summary: string
): AppleFlowTrace {
	const trace = getAppleFlowTrace(req);
	trace.status = status;
	trace.outcomeCode = outcomeCode;
	trace.summary = summary;
	trace.updatedAt = new Date().toISOString();
	return trace;
}

export function encodeAppleFlowTrace(req: Request): string | null {
	try {
		const trace = getAppleFlowTrace(req);
		return Buffer.from(safeStringify(trace)).toString('base64url');
	} catch {
		return null;
	}
}
