import type { Config } from 'jest';
import { appCoverageSources, combinedCoverageThreshold } from './jest.coverage.ts';
import { baseConfig } from './jest.config.ts';

/** CI entry (`yarn test`): full suite serially with combined whole-app coverage gate. */
const config: Config = {
	...baseConfig,
	collectCoverageFrom: appCoverageSources,
	testTimeout: 30000,
	maxWorkers: 1,
	coverageThreshold: combinedCoverageThreshold,
};

export default config;
