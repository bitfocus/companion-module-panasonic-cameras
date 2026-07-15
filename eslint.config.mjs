import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({})

export default [
	...baseConfig,
	{
		languageOptions: {
			sourceType: 'module',
		},
	},
	{
		// Tests are not part of the published package, so they may import devDependencies.
		files: ['**/__tests__/**'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
