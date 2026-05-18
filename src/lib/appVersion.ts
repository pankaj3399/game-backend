import { readFileSync } from 'fs';
import { join } from 'path';

type PackageJson = {
	version?: string;
};

export function resolveAppVersion(): string {
	const fromEnv =
		process.env.APP_VERSION?.trim() || process.env.npm_package_version?.trim();
	if (fromEnv) return fromEnv;

	try {
		const packageJson = JSON.parse(
			readFileSync(join(process.cwd(), 'package.json'), 'utf8')
		) as PackageJson;
		return packageJson.version?.trim() || 'dev';
	} catch {
		return 'dev';
	}
}
