import type { Config } from 'jest';
import { appCoverageSources, combinedCoverageThreshold } from './jest.coverage.ts';

export {
	appCoverageSources,
	combinedCoverageThreshold,
	integrationCoverageThreshold,
	unitCoverageThreshold,
} from './jest.coverage.ts';

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
		'^.+\\.tsx?$': ['ts-jest', {}],
	},
};

const config: Config = {
	...baseConfig,
	collectCoverageFrom: appCoverageSources,
	coverageThreshold: combinedCoverageThreshold,
};

export default config;
