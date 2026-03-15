export function buildErrorPayload(message: string) {
	return {
		message,
		error: true
	};
}
