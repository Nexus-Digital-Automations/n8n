/** @type {import('jest').Config} */
module.exports = {
	...require('../../../jest.config.cjs'),
	transform: {
		'^.+\\.ts$': [
			'ts-jest',
			{
				tsconfig: {
					isolatedModules: false,
				},
			},
		],
	},
};
