import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { optionSpecs } from './common.js'

// Companion 2.0 validates every option an entity's definition declares, and one a stored button
// never got is as invalid as a wrong one: for a dropdown, undefined is simply "not in the list of
// choices", which takes the whole action down — even where the field is hidden behind an
// isVisibleExpression and the action would never read it. The presets used to name only the options
// they cared about (`{ op: 't' }` and nothing else), so every button built from one lacks the rest.
// The presets we hand out are reconciled against the definitions now (see presets.js); this does the
// same for the buttons that are already on disk.
function fillOmittedOptions(_context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	// Which options exist, and what they default to, depends on the model — so the definitions have
	// to be built the same way the running instance builds them. On an Auto connection the model is
	// only known once a camera answers, so this falls back to the common set; a default that turns
	// out not to fit the camera is harmless, because the fields being filled here are exactly the
	// ones the button never reads (`set` is only looked at when the operation is Set, and a button
	// doing that has always stored the value the user picked).
	let actionSpecs, feedbackSpecs
	try {
		const self = {
			config: props.config ?? { model: 'Other' },
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}
		actionSpecs = optionSpecs(getActionDefinitions(self))
		feedbackSpecs = optionSpecs(getFeedbackDefinitions(self))
	} catch {
		return result // a model we cannot resolve leaves us nothing to reconcile against
	}

	// Only ever add what is missing. An option the button already carries is the user's choice, and
	// one this model's action does not declare is left alone too — it costs nothing and survives a
	// switch back to the model that does have it.
	const fill = (entities, idKey, specs, updated) => {
		for (const entity of entities ?? []) {
			const spec = specs[entity[idKey]]
			if (!spec) continue

			const omitted = spec.ids.filter((id) => !(id in (entity.options ?? {})) && id in spec.defaults)
			if (omitted.length === 0) continue

			entity.options = { ...entity.options }
			for (const id of omitted) entity.options[id] = spec.defaults[id]
			updated.push(entity)
		}
	}

	fill(props.actions, 'actionId', actionSpecs, result.updatedActions)
	fill(props.feedbacks, 'feedbackId', feedbackSpecs, result.updatedFeedbacks)

	return result
}

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
	// Companion tracks how far a connection has been upgraded by index, so new scripts go last.
	fillOmittedOptions,
]
