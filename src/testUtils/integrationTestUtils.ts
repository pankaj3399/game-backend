import type { Express, RequestHandler } from 'express';
import {
	buildJsonApp,
	request,
	type HttpResult,
} from './routeIntegrationTestUtils';

type JsonRequestInit = Omit<RequestInit, 'body'> & {
	body?: unknown;
};

export { buildJsonApp };

export async function requestJson<T = unknown>(
	app: Express,
	path: string,
	init: JsonRequestInit = {},
): Promise<HttpResult<T>> {
	const { body, headers, ...rest } = init;
	return request<T>(app, path, {
		...rest,
		headers,
		body: body === undefined || typeof body === 'string' ? body : JSON.stringify(body),
	});
}

export function buildRouterApp(path: string, router: RequestHandler) {
	return buildJsonApp(path, router);
}

type SsePreviewOptions = {
	maxBytes?: number;
	timeoutMs?: number;
};

/**
 * Opens an SSE route, reads the first chunk, then aborts so the test can assert
 * on partial stream output without hanging until the server closes the connection.
 */
export async function readSsePreview(
	app: Express,
	path: string,
	init: RequestInit = {},
	options: SsePreviewOptions = {},
) {
	const maxBytes = options.maxBytes ?? 512;
	const timeoutMs = options.timeoutMs ?? 750;
	const headers = new Headers(init.headers);
	const server = await new Promise<import('http').Server>((resolve) => {
		const listeningServer = app.listen(0, () => resolve(listeningServer));
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Test server did not bind to a TCP port');
	}

	const controller = new AbortController();
	const url = `http://127.0.0.1:${address.port}${path}`;

	try {
		const response = await fetch(url, {
			...init,
			headers,
			signal: controller.signal,
		});

		const body = await new Promise<string>((resolve, reject) => {
			const chunks: Buffer[] = [];
			let settled = false;

			const finish = (value: string) => {
				if (settled) return;
				settled = true;
				controller.abort();
				resolve(value);
			};

			const timer = setTimeout(() => finish(Buffer.concat(chunks).toString('utf8')), timeoutMs);

			if (!response.body) {
				clearTimeout(timer);
				finish('');
				return;
			}

			const reader = response.body.getReader();
			const pump = async () => {
				try {
					while (true) {
						const { done, value } = await reader.read();
						if (done) break;
						if (value) {
							chunks.push(Buffer.from(value));
							if (Buffer.concat(chunks).length >= maxBytes) {
								clearTimeout(timer);
								finish(Buffer.concat(chunks).toString('utf8'));
								return;
							}
						}
					}
					clearTimeout(timer);
					finish(Buffer.concat(chunks).toString('utf8'));
				} catch (error) {
					clearTimeout(timer);
					if (controller.signal.aborted) {
						finish(Buffer.concat(chunks).toString('utf8'));
						return;
					}
					reject(error);
				}
			};

			void pump();
		});

		return {
			status: response.status,
			contentType: response.headers.get('content-type'),
			body,
		};
	} finally {
		await new Promise<void>((resolve, reject) => {
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}
}
