export function isDuplicateKeyError(err: unknown): boolean {
	const mongoErr = err as { code?: number; name?: string };
	return (
		mongoErr.code === 11000 &&
		(mongoErr.name === 'MongoServerError' || mongoErr.name === 'MongoError')
	);
}
