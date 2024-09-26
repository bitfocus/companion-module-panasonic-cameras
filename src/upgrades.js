export const upgradeScripts = [
	function addSetIncDecVariables(_context, props) {
		const result = {
			updatedActions: [],
			updatedConfig: null,
			updatedFeedbacks: [],
		}

		for (const action of props.actions) {
			switch (action.actionId) {
				case 'iris':
				case 'ped':
				case 'pedRed':
				case 'pedBlue':
				case 'gainRed':
				case 'gainBlue':
				case 'colorTemperature':
					action.options.useVar = action.options.useVar === undefined ? false : action.options.useVar
					action.options.setVar = action.options.setVar === undefined ? '0' : action.options.setVar
					action.options.stepVar = action.options.stepVar === undefined ? '1' : action.options.stepVar
					result.updatedActions.push(action)
					break
			}
		}
		return result
	},
]
