import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function shortSha(value: string): string {
	const trimmed = value.trim();
	return trimmed.length <= 7 ? trimmed : trimmed.slice(0, 7);
}

function readBakedSha(): string | null {
	const bakedPath = join(__dirname, '..', 'generated', 'commit-sha.txt');
	if (!existsSync(bakedPath)) return null;

	try {
		const value = readFileSync(bakedPath, 'utf8').trim();
		return value && value !== 'dev' ? value : null;
	} catch {
		return null;
	}
}

/** Resolve deploy commit for /api/version (Vercel, local git, or build-time bake). */
export function resolveCommitSha(): string {
	const fromEnv =
		process.env.VERCEL_GIT_COMMIT_SHA?.trim() || process.env.COMMIT_SHA?.trim();

	if (fromEnv) {
		return shortSha(fromEnv);
	}

	const baked = readBakedSha();
	if (baked) return baked;

	try {
		return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
	} catch {
		return 'dev';
	}
}
