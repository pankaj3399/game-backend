import { readFileSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';

const packageJsonSchema = z.object({
	version: z.string().optional(),
});

export function resolveAppVersion(): string {
	const fromEnv =
		process.env.APP_VERSION?.trim() || process.env.npm_package_version?.trim();
	if (fromEnv) return fromEnv;

	try {
		const parsed = packageJsonSchema.safeParse(
			JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8'))
		);
		if (parsed.success) {
			return parsed.data.version?.trim() || 'dev';
		}
		return 'dev';
	} catch {
		return 'dev';
	}
}
