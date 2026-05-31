/** Shared coverage scope and thresholds for all Jest configs. */

export const appCoverageSources = [
	'src/**/*.ts',
	'!src/**/*.test.ts',
	'!src/**/*.spec.ts',
	'!src/**/__tests__/**',
	'!src/generated/**',
	'!src/types/**',
	'!src/server.ts',
	'!src/testUtils/**',
	'!src/**/types.ts',
];

/** CI / combined suite: whole application, unit + integration. */
export const combinedCoverageThreshold = {
	global: {
		statements: 60,
		branches: 50,
		functions: 60,
		lines: 60,
	},
} as const;

/**
 * Unit-only gate: 60% on whole-app lines/statements without integration tests.
 * Functions are reported but not gated (many Zod transforms and route wiring
 * inflate the function count without reflecting missing behavioral coverage).
 */
export const unitCoverageThreshold = {
	global: {
		statements: 60,
		branches: 50,
		lines: 60,
	},
} as const;

/** Integration-only run against the same whole-application scope. */
export const integrationCoverageThreshold = {
	global: {
		statements: 50,
		branches: 45,
		functions: 50,
		lines: 50,
	},
} as const;
