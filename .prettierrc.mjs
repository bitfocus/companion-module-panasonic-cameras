import companionModulePrettierConfig from '@@companion-module/tools/.prettierrc.json/tools/.prettierrc.json'

/**
 * @type {import("prettier").Config}
 */
const config = {
	...companionModulePrettierConfig,
	printWidth: 360, // Override print width to accommodate long lines in this module
}

export default config
