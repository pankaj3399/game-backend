import { readFileSync } from 'fs';
import { join } from 'path';

type PackageJson = {
	version?: string;
};

export function resolveAppVersion(): string {
	const fromEnv = process.env.APP_VERSION ?? process.env.npm_package_version;
	if (fromEnv?.trim()) return fromEnv.trim();

	try {
		const packageJson = JSON.parse(
			readFileSync(join(process.cwd(), 'package.json'), 'utf8')
		) as PackageJson;
		return packageJson.version?.trim() || 'dev';
	} catch {
		return 'dev';
	}
}
