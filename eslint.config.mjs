import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({})

const customConfig = [
	...baseConfig,
	{
		languageOptions: {
			sourceType: 'module',
		},
		rules: {
			'n/no-missing-import': 'off',
			'node/no-unpublished-import': 'off',
			'linebreak-style': ['error', require('os').EOL === '\r\n' ? 'windows' : 'unix'],
		},
	},
]

export default customConfig
