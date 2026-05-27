import type { Config } from 'jest';
import { baseConfig, integrationCoverageSources } from './jest.config.ts';

const config: Config = {
	...baseConfig,
	coverageDirectory: 'coverage/integration',
	collectCoverageFrom: integrationCoverageSources,
	testMatch: ['**/*.integration.test.ts'],
	coverageThreshold: {
		global: {
			statements: 50,
		},
	},
};

export default config;
