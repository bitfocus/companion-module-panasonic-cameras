import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'
import { EOL } from 'os'

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
			'linebreak-style': ['error', EOL === '\r\n' ? 'windows' : 'unix'],
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

export default customConfig
