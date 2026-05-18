import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function shortSha(value) {
	const trimmed = String(value).trim();
	return trimmed.length <= 7 ? trimmed : trimmed.slice(0, 7);
}

function resolveSha() {
	if (process.env.VERCEL_GIT_COMMIT_SHA) {
		return shortSha(process.env.VERCEL_GIT_COMMIT_SHA);
	}
	if (process.env.COMMIT_SHA) {
		return shortSha(process.env.COMMIT_SHA);
	}
	try {
		return execSync('git rev-parse --short HEAD', {
			encoding: 'utf8',
			cwd: root,
		}).trim();
	} catch {
		return 'dev';
	}
}

const sha = resolveSha();
const distGenerated = join(root, 'dist', 'generated');

if (!existsSync(join(root, 'dist'))) {
	console.warn('[write-commit-sha] dist/ not found — run after `tsc`');
	process.exit(0);
}

mkdirSync(distGenerated, { recursive: true });
writeFileSync(join(distGenerated, 'commit-sha.txt'), sha, 'utf8');
console.log(`[write-commit-sha] wrote ${sha} to dist/generated/commit-sha.txt`);
