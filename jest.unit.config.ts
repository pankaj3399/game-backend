import type { Config } from 'jest';
import { baseConfig, unitCoverageSources } from './jest.config.ts';

const config: Config = {
	...baseConfig,
	coverageDirectory: 'coverage/unit',
	collectCoverageFrom: unitCoverageSources,
	testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns ?? []), '\\.integration\\.test\\.ts$'],
	coverageThreshold: {
		global: {
			statements: 60,
		},
	},
};

export default config;
