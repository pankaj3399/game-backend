import express from 'express';
import type { Express, Request, RequestHandler, Response } from 'express';
import type { Server } from 'http';

export type HttpResult<T = unknown> = {
	status: number;
	body: T | null;
};

export function controllerMarker(name: string): RequestHandler {
	return (req: Request, res: Response) => {
		res.status(200).json({
			handler: name,
			params: req.params,
			body: req.body ?? {},
			role: req.user?.role ?? null,
		});
	};
}

export function buildJsonApp(path: string, router: RequestHandler): Express {
	const app = express();
	app.use(express.json());
	app.use(path, router);
	return app;
}

export async function request<T = unknown>(
	app: Express,
	path: string,
	init: RequestInit = {},
): Promise<HttpResult<T>> {
	const headers = new Headers(init.headers);
	if (init.body != null && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}
	const server = await new Promise<Server>((resolve) => {
		const listeningServer = app.listen(0, () => resolve(listeningServer));
	});
	const address = server.address();
	if (!address || typeof address === 'string') {
		server.close();
		throw new Error('Test server did not bind to a TCP port');
	}

	try {
		const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
			...init,
			headers,
		});
		const text = await response.text();
		return {
			status: response.status,
			body: text ? JSON.parse(text) : null,
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
