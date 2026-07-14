import { EmptyUpgradeScript, FixupNumericOrVariablesValueToExpressions } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { constrainRange, getAndUpdateSeries, optionSpecs } from './common.js'

// The options the "Use Variable" construct left behind. Deleted from every button that carries them,
// whether or not the checkbox was on: where it was off, the plain field already holds the value that
// was in effect.
const DEAD_OPTIONS = ['useVar', 'setVar', 'stepVar', 'valVar', 'optionVar']

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

// Every option field is expression-capable in module-base 2.0, so the module's own "Use Variable"
// checkbox — which swapped a dropdown/number field for a parallel textinput — is gone, and with it
// `useVar`, `setVar`, `stepVar`, `valVar` and `optionVar`. Buttons already on disk still carry them:
// where the checkbox was on, the variable input holds the value the button actually used, so it has
// to be lifted onto the plain field as an expression before the dead keys are dropped.
//
// Two shapes have to be read. An upgrade script sees options in the 2.0 wrapper
// ({ isExpression, value }), but the scripts above this one wrote plain values into them, so what is
// on disk may be either.
const unwrap = (option) =>
	option !== null && typeof option === 'object' && !Array.isArray(option) && 'isExpression' in option
		? option
		: { isExpression: false, value: option }

// `useVar` was a checkbox that opted out of expressions, so it is never an expression itself — but it
// may be stored wrapped or raw.
const wasOn = (option) => unwrap(option).value === true

// The preset option is 0-based (its choice ids are the camera's own preset numbers) while the
// variable input took the 1-based number off the label, so a migrated value has to lose the offset.
// A literal can go one better than an expression and become the dropdown id it named, which leaves
// the button looking like a plain choice again.
function toPresetIndex(stored, max) {
	const fixed = FixupNumericOrVariablesValueToExpressions(unwrap(stored))
	if (!fixed) return undefined
	if (fixed.isExpression) return { isExpression: true, value: `(${fixed.value}) - 1` }

	const num = Number(fixed.value)
	if (!Number.isFinite(num)) return fixed

	const idx = constrainRange(Math.trunc(num) - 1, 0, max - 1)
	return { isExpression: false, value: idx.toString(10).padStart(2, '0') }
}

// How many preset slots this model has, so a literal is clamped to one the dropdown actually offers.
// Same fallback as fillOmittedOptions: a model we cannot resolve must not throw, or the upgrade takes
// the whole connection down.
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

	// Keyed on the options a button carries, not on a list of action ids: the stepped options are
	// built by one shared builder used by ten actions, and the hardcoded list the first script above
	// carries already misses half of them.
	const migrate = (entity) => {
		const options = entity.options
		if (!options) return false
		if (!DEAD_OPTIONS.some((id) => id in options)) return false

		if (wasOn(options.useVar)) {
			// Only the variable input held what the button really did; the plain field beside it was
			// whatever the user last left there — or, since fillOmittedOptions runs before this script,
			// the definition's default. So this overwrites unconditionally rather than filling a gap.
			// Both `set` and `step` are migrated, not just the one the current operation reads, so
			// switching the operation later still does what the user set up.
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
	// Was addSetIncDecVariables, which backfilled the very options dropUseVarToggles now removes.
	// Blanked rather than deleted: Companion tracks how far a connection has been upgraded by index.
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
	// Companion tracks how far a connection has been upgraded by index, so new scripts go last.
	fillOmittedOptions,
	dropUseVarToggles,
]
