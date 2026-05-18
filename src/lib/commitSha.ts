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

	const value = readFileSync(bakedPath, 'utf8').trim();
	return value && value !== 'dev' ? value : null;
}

/** Resolve deploy commit for /api/version (Vercel, local git, or build-time bake). */
export function resolveCommitSha(): string {
	const fromEnv = process.env.COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA;

	if (fromEnv?.trim()) {
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
