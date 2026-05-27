import type { Config } from 'jest';

const testFileExclusions = [
	'!src/**/*.test.ts',
	'!src/**/*.spec.ts',
	'!src/**/__tests__/**',
];

const generatedAndEntrypointExclusions = [
	'!src/generated/**',
	'!src/server.ts',
	'!src/types/**',
	'!src/routes/**',
	'!src/models/**',
	'!src/validation/**',
	'!src/lib/passport.ts',
	'!src/lib/config.ts',
	'!src/lib/oauthState.ts',
	'!src/controllers/**/index.ts',
	'!src/controllers/**/types.ts',
	'!src/controllers/**/validation.ts',
	'!src/controllers/**/queries.ts',
	'!src/controllers/**/events.ts',
	'!src/controllers/**/authorize.ts',
];

export const unitCoverageSources = [
	'src/constants/**/*.ts',
	'src/shared/**/*.ts',
	'src/lib/glicko2.ts',
	'src/lib/jwtAuth.ts',
	'src/lib/logger.ts',
	'src/lib/permissions.ts',
	'src/lib/validation.ts',
	'src/controllers/**/mapper.ts',
	'src/controllers/**/helpers.ts',
	'src/controllers/**/shared/**/*.ts',
	'src/controllers/tournament/computeSpotsTotal.ts',
	'src/controllers/tournament/scoreQr/scoreHelpers.ts',
	'src/controllers/tournament/updateTournament/activeEnrolledUpdate.ts',
	'src/controllers/tournament/updateTournament/computeEffectiveSponsor.ts',
	'src/controllers/tournament/updateTournament/scheduleActivationEnrollment.ts',
	'src/controllers/schedule/generateSchedule/pairingFromDemand.ts',
	...testFileExclusions,
	...generatedAndEntrypointExclusions,
	'!src/shared/authContext.ts',
	'!src/shared/index.ts',
	'!src/shared/relations.ts',
];

export const integrationCoverageSources = [
	'src/routes/**/*.ts',
	'src/middlewares/**/*.ts',
	'src/lib/validation.ts',
	'src/lib/jwtAuth.ts',
	'src/constants/roles.ts',
	'src/controllers/sponsor/**/*.ts',
	'src/controllers/tournament/getTournamentById/**/*.ts',
	'src/controllers/tournament/shared/authorizeGetById.ts',
	'src/controllers/tournament/shared/fetchTournamentById.ts',
	...testFileExclusions,
	'!src/middlewares/index.ts',
];

export const baseConfig: Config = {
	clearMocks: true,
	collectCoverage: true,
	coverageDirectory: 'coverage',
	coverageProvider: 'v8',
	setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
	testEnvironment: 'jest-environment-node',
	testTimeout: 10000,
	testPathIgnorePatterns: ['/node_modules/', '/dist/'],
	transform: {
		'^.+\\.tsx?$': [
			'ts-jest',
			{
				diagnostics: {
					ignoreCodes: [151002],
				},
			},
		],
	},
};

const config: Config = {
	...baseConfig,
	collectCoverageFrom: unitCoverageSources,
	coverageThreshold: {
		global: {
			statements: 60,
		},
	},
};

export default config;
