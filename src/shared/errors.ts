import type { ZodError } from "zod";

export function buildErrorPayload(message: string) {
	return {
		message,
		error: true
	};
}

export function buildZodErrorPayload(error: ZodError) {
	const message = error.issues.map((issue) => issue.message).join("; ");
	return buildErrorPayload(message);
}

export class AppError extends Error {
	statusCode: number;

	constructor(message: string, statusCode = 500) {
		super(message);
		this.name = "AppError";
		this.statusCode = statusCode;
	}
}
