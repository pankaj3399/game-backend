import type { Config } from 'jest';

const config: Config = {
	clearMocks: true,
	collectCoverage: true,
	coverageDirectory: 'coverage',
	coverageProvider: 'v8',
	preset: 'ts-jest',
	testEnvironment: 'jest-environment-node',
	testTimeout: 10000
};

export default config;
