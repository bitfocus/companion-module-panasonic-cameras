export const upgradeScripts = [
	function addSetIncDecVariables(_context, props) {
		const result = {
			updatedActions: [],
			updatedConfig: null,
			updatedFeedbacks: [],
		}

		for (const action of props.actions) {
			switch (action.actionId) {
				case 'focusFollow':
				case 'iris':
				case 'ped':
				case 'pedRed':
				case 'pedBlue':
				case 'gainRed':
				case 'gainBlue':
				case 'colorTemperature':
					action.options.useVar = action.options.useVar === undefined ? false : action.options.useVar
					action.options.setVar = action.options.setVar === undefined ? `${action.options.set}` : action.options.setVar
					action.options.stepVar =
						action.options.stepVar === undefined ? `${action.options.step}` : action.options.stepVar
					result.updatedActions.push(action)
					break
			}
		}
		return result
	},
	function addSetStepSize(_context, props) {
		const result = {
			updatedActions: [],
			updatedConfig: null,
			updatedFeedbacks: [],
		}

		for (const action of props.actions) {
			switch (action.actionId) {
				case 'ptSpeed':
				case 'zoomSpeed':
				case 'focusSpeed':
					action.options.step = action.options.step === undefined ? 1 : action.options.step
					result.updatedActions.push(action)
					break
			}
		}
		return result
	},
]
