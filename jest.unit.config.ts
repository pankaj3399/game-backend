import type { Config } from 'jest';
import { appCoverageSources, unitCoverageThreshold } from './jest.coverage.ts';
import { baseConfig } from './jest.config.ts';

const config: Config = {
	...baseConfig,
	displayName: 'unit',
	coverageDirectory: 'coverage/unit',
	collectCoverageFrom: appCoverageSources,
	testPathIgnorePatterns: [...(baseConfig.testPathIgnorePatterns ?? []), '\\.integration\\.test\\.ts$'],
	coverageThreshold: unitCoverageThreshold,
};

export default config;
