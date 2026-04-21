export function buildErrorPayload(message: string) {
	return {
		message,
		error: true
	};
}

export class AppError extends Error {
	statusCode: number;

	constructor(message: string, statusCode = 500) {
		super(message);
		this.name = "AppError";
		this.statusCode = statusCode;
	}
}
