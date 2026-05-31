import type { Config } from 'jest';
import { appCoverageSources, integrationCoverageThreshold } from './jest.coverage.ts';
import { baseConfig } from './jest.config.ts';

const config: Config = {
	...baseConfig,
	coverageDirectory: 'coverage/integration',
	collectCoverageFrom: appCoverageSources,
	testMatch: ['**/*.integration.test.ts'],
	testTimeout: 30000,
	maxWorkers: 1,
	coverageThreshold: integrationCoverageThreshold,
};

export default config;
