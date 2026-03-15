export function ok<T, S extends number = 200>(data: T, options?: { status?: S; message?: string }) {
	return {
		ok: true as const,
		status: (options?.status ?? 200) as S,
		message: options?.message ?? 'Success',
		data
	};
}

export const error = <S extends number>(status: S, message: string) => ({
	ok: false as const,
	status,
	message
});
