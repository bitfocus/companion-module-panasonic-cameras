import { EmptyUpgradeScript, FixupNumericOrVariablesValueToExpressions } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { constrainRange, getAndUpdateSeries, optionSpecs } from './common.js'

// Leftovers from the "Use Variable" construct, dropped from every button that carries them.
const DEAD_OPTIONS = ['useVar', 'setVar', 'stepVar', 'valVar', 'optionVar']

// 2.0 validates every declared option; an option a stored button never got is invalid (undefined is
// "not in the dropdown choices") and takes the whole action down, even when hidden. Reconciles
// on-disk buttons against the definitions, as presets.js already does for presets we hand out.
function fillOmittedOptions(_context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	// Options and defaults are model-dependent, so build definitions as the running instance does.
	// Auto falls back to the common set; a mismatched default is harmless since these fields are the
	// ones the button never reads.
	let actionSpecs, feedbackSpecs
	try {
		const self = {
			config: props.config ?? { model: 'Other' },
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}
		actionSpecs = optionSpecs(getActionDefinitions(self))
		feedbackSpecs = optionSpecs(getFeedbackDefinitions(self))
	} catch {
		return result // unresolvable model: nothing to reconcile against
	}

	// Only add what is missing; existing options are the user's choice and are left alone.
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

// Every field is expression-capable in 2.0, so the "Use Variable" checkbox and its useVar/setVar/
// stepVar/valVar/optionVar are gone. On-disk buttons still carry them; where the checkbox was on, the
// variable input's value must be lifted onto the plain field as an expression before the keys drop.
// May be stored wrapped ({ isExpression, value }) or as a raw value written by earlier scripts.
const unwrap = (option) =>
	option !== null && typeof option === 'object' && !Array.isArray(option) && 'isExpression' in option
		? option
		: { isExpression: false, value: option }

// useVar is a checkbox, never an expression, but may be stored wrapped or raw.
const wasOn = (option) => unwrap(option).value === true

// Preset option is 0-based but the variable input held the 1-based label number, so drop the offset.
// A literal becomes the zero-padded dropdown id; an expression stays an expression.
function toPresetIndex(stored, max) {
	const fixed = FixupNumericOrVariablesValueToExpressions(unwrap(stored))
	if (!fixed) return undefined
	if (fixed.isExpression) return { isExpression: true, value: `(${fixed.value}) - 1` }

	const num = Number(fixed.value)
	if (!Number.isFinite(num)) return fixed

	const idx = constrainRange(Math.trunc(num) - 1, 0, max - 1)
	return { isExpression: false, value: idx.toString(10).padStart(2, '0') }
}

// Preset-slot count for clamping literals. Must not throw on an unresolvable model, or the upgrade
// takes the whole connection down.
function presetCount(config) {
	try {
		const self = {
			config: config ?? { model: 'Other' },
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}
		return getAndUpdateSeries(self).capabilities.preset || 100
	} catch {
		return 100
	}
}

function dropUseVarToggles(_context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }
	const max = presetCount(props.config)

	// Keyed on the options a button carries, not on action ids: the stepped options come from one
	// shared builder used by many actions, so an id list would miss half of them.
	const migrate = (entity) => {
		const options = entity.options
		if (!options) return false
		if (!DEAD_OPTIONS.some((id) => id in options)) return false

		if (wasOn(options.useVar)) {
			// Only the variable input held the real value, so overwrite the plain field unconditionally.
			// Migrate both set and step (not just the operation's current one) so switching later still works.
			if ('setVar' in options) options.set = FixupNumericOrVariablesValueToExpressions(unwrap(options.setVar))
			if ('stepVar' in options) options.step = FixupNumericOrVariablesValueToExpressions(unwrap(options.stepVar))
			if ('valVar' in options) options.val = toPresetIndex(options.valVar, max)
			if ('optionVar' in options) options.option = toPresetIndex(options.optionVar, max)
		}

		for (const id of DEAD_OPTIONS) delete options[id]
		return true
	}

	for (const action of props.actions ?? []) if (migrate(action)) result.updatedActions.push(action)
	for (const feedback of props.feedbacks ?? []) if (migrate(feedback)) result.updatedFeedbacks.push(feedback)

	return result
}

export const upgradeScripts = [
	// Was addSetIncDecVariables. Blanked, not deleted: upgrade progress is tracked by index.
	EmptyUpgradeScript,
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
	// Upgrade progress is tracked by index, so new scripts go last.
	fillOmittedOptions,
	dropUseVarToggles,
]
