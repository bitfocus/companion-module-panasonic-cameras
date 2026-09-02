import { EmptyUpgradeScript, FixupNumericOrVariablesValueToExpressions } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { constrainRange, getAndUpdateSeries, optionSpecs } from './common.js'
import { FACTORY_LOGIN } from './config.js'

// Leftovers from the "Use Variable" construct, dropped from every button that carries them.
const DEAD_OPTIONS = ['useVar', 'setVar', 'stepVar', 'valVar', 'optionVar']

// An upgrade script's options are CompanionMigrationOptionValues: every entry is an
// ExpressionOrValue wrapper, with none of the "raw value also accepted" leniency preset options get.
// A bare write reads back as `.value === undefined`, which is exactly the invalid option these
// scripts exist to repair. Everything written to an entity's options goes through here.
const wrap = (value) => ({ isExpression: false, value })

// Which camera these buttons belong to. props.config is only filled when the *connection* itself is
// being upgraded; upgrading buttons hands it over as null, and reconciling a UE160's buttons against
// the generic `Other` action set reintroduces exactly the invalid option this file exists to repair.
// The context is the field documented as "current configuration of the module", so it comes first.
const configOf = (context, props) => context?.currentConfig ?? props.config ?? { model: 'Other' }

// 2.0 validates every declared option; an option a stored button never got is invalid (undefined is
// "not in the dropdown choices") and takes the whole action down, even when hidden. Reconciles
// on-disk buttons against the definitions, as presets.js already does for presets we hand out.
function fillOmittedOptions(context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	// Options and defaults are model-dependent, so build definitions as the running instance does.
	// Auto falls back to the common set; a mismatched default is harmless since these fields are the
	// ones the button never reads.
	let actionSpecs, feedbackSpecs
	try {
		const self = {
			config: configOf(context, props),
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
			for (const id of omitted) entity.options[id] = wrap(spec.defaults[id])
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
			config,
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}
		return getAndUpdateSeries(self).capabilities.preset || 100
	} catch {
		return 100
	}
}

function dropUseVarToggles(context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }
	const max = presetCount(configOf(context, props))

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

// The value the current model's definition would accept in place of a stored one it would not.
// Companion drops the whole entity over a single dropdown value outside `choices`, so putting the
// model's own default back is strictly better than leaving the button dead — which is also why a
// value stranded by the operator switching models afterwards is repaired here rather than left.
function reconcileValue(option, field) {
	if (field.type !== 'dropdown') return option // number fields are clamped by the callback

	const ids = field.choices.map((choice) => choice.id)
	if (ids.includes(option.value)) return option

	// The preset dropdown is the one that takes any index (allowInvalidValues) and constrains it, so
	// its stored number only needs bringing back into the range this model actually has.
	if (field.allowInvalidValues) {
		const idx = parseInt(option.value, 10)
		if (!Number.isFinite(idx)) return option
		return wrap(
			constrainRange(idx, 0, ids.length - 1)
				.toString(10)
				.padStart(2, '0'),
		)
	}

	return field.default === undefined ? option : wrap(field.default)
}

// v2.0.0 shipped the two scripts above writing bare values, and resolving the model from a
// props.config that is null whenever buttons rather than the connection are being upgraded. Companion
// tracks upgrade progress by index, so neither slot ever runs again for a connection that already
// passed through 2.0.0 — appending is the only way to reach those buttons. For a connection coming
// straight from 1.x this is a no-op: the repaired slots already wrote the right shape, from the right
// model.
function repairPre201Writes(context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	let actionSpecs, feedbackSpecs
	try {
		const self = {
			config: configOf(context, props),
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}
		actionSpecs = optionSpecs(getActionDefinitions(self))
		feedbackSpecs = optionSpecs(getFeedbackDefinitions(self))
	} catch {
		return result // unresolvable model: nothing to reconcile against
	}

	const repair = (entities, idKey, specs, updated) => {
		for (const entity of entities ?? []) {
			const spec = specs[entity[idKey]]
			if (!spec || !entity.options) continue

			let changed = false
			for (const [id, stored] of Object.entries(entity.options)) {
				const field = spec.fields[id]
				if (!field) continue

				// unwrap() returns the stored object itself when it is already a wrapper, so an identity
				// check is what separates "was written bare" from "was already fine".
				const option = unwrap(stored)
				const fixed = option.isExpression ? option : reconcileValue(option, field)

				if (fixed !== stored) {
					entity.options[id] = fixed
					changed = true
				}
			}

			if (changed) updated.push(entity)
		}
	}

	repair(props.actions, 'actionId', actionSpecs, result.updatedActions)
	repair(props.feedbacks, 'feedbackId', feedbackSpecs, result.updatedFeedbacks)

	return result
}

// The colour temperature step used to be offered as a Kelvin delta and then thrown away — every
// Increase/Decrease sent one notch regardless. OSI:1E/OSI:1F take a count of notches, so the field's
// range moved from 20..13000 to 1..10. Without this a stored 20 would be clamped to 10 notches and
// turn a nudge into a leap. Keyed on the action id rather than on the options: this is the only
// action whose step field changed unit, and the builder it shares is used by a dozen others.
function rescaleColorTemperatureStep(_context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	for (const action of props.actions ?? []) {
		if (action.actionId !== 'colorTemperature') continue
		if (!action.options || !('step' in action.options)) continue

		// Every stored step resets, whatever it holds. There is no value to preserve: the old field was a
		// Kelvin delta with a minimum of 20 and the old callback sent `inc + ':1'` regardless, so a small
		// number was never a notch count - it was an out-of-range Kelvin delta the field's
		// allowInvalidValues let through, and it still moved exactly one notch. Expressions go for the
		// same reason: one returning 500 would clamp to ten notches now, the very leap this prevents.
		const option = unwrap(action.options.step)
		if (!option.isExpression && option.value === 1) continue // already the one notch it always sent

		action.options.step = wrap(1)
		result.updatedActions.push(action)
	}

	return result
}

// `debug` gated every log line the module produced, at info level, so it was all-or-nothing and none
// of it reached Companion's own filtering. The lines are debug level now and always emitted; the flag
// that survives only decides whether the repeating poll traffic joins them. Same meaning for a user
// who had it on - "show me the protocol" - so the stored value carries over rather than resetting.
function renameDebugToTrace(_context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	if (props.config && 'debug' in props.config) {
		const { debug, ...rest } = props.config
		result.updatedConfig = { ...rest, trace: debug === true }
	}

	return result
}

// The restart action carried its own administrator user name and password, because Admin is the one
// level the camera guards even while "User auth." is off. Everything runs on the connection's own
// login now, so those options are gone from the definition — and a button that still holds them
// would leave two logins on disk with nothing to say which one wins.
//
// They are lifted onto the connection rather than discarded: they are the credentials that made this
// user's restart button work, and dropping them would break it silently. Only onto a connection that
// has none of its own, so a login the user has since entered is never overwritten. Where several
// buttons disagree the first one wins — there is one connection and no way to honour two answers.
function dropRestartCredentials(_context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }
	const carried = []

	for (const action of props.actions ?? []) {
		if (action.actionId !== 'restart') continue
		if (!('username' in action.options) && !('password' in action.options)) continue

		carried.push({
			username: unwrap(action.options.username).value ?? '',
			password: unwrap(action.options.password).value ?? '',
		})

		delete action.options.username
		delete action.options.password
		result.updatedActions.push(action)
	}

	// A connection that predates the login fields has none, and the restart action no longer carries
	// its own — so without this, restarting would stop working on every existing installation. Give
	// the connection whatever a restart button was using, or else the factory login: the same value a
	// connection created today starts with, and the one that makes restart work on a camera whose
	// "User auth." was never switched on.
	//
	// Only ever applied to a connection that has no login at all, so nothing a user set can be
	// overwritten. props.config is null when buttons are upgraded rather than a connection; the
	// connection's own pass does the lifting then.
	const adopt = carried.find(({ username, password }) => username || password) ?? FACTORY_LOGIN
	const vacant = props.config && !props.config.username && !props.secrets?.password

	if (vacant) {
		result.updatedConfig = { ...props.config, username: adopt.username }
		result.updatedSecrets = { ...(props.secrets ?? {}), password: adopt.password }
	}

	return result
}

// The AW-UB10/AW-UB50 gain action lost its Set and Toggle operations: those cameras step the gain and
// take no value at all. A button still naming one holds a dropdown value outside `choices`, which
// Companion answers by dropping the whole action - and repairPre201Writes, which would have put the
// model's default back, sits at an index every existing connection has already passed. Keyed on the
// action id: gain is the only action whose operations narrowed.
function repairSteppedGain(context, props) {
	const result = { updatedActions: [], updatedConfig: null, updatedFeedbacks: [] }

	let field
	try {
		const self = {
			config: configOf(context, props),
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}
		field = optionSpecs(getActionDefinitions(self)).gain?.fields.op
	} catch {
		return result // unresolvable model: nothing to reconcile against
	}

	if (!field) return result

	for (const action of props.actions ?? []) {
		if (action.actionId !== 'gain' || !action.options || !('op' in action.options)) continue

		const option = unwrap(action.options.op)
		const fixed = option.isExpression ? option : reconcileValue(option, field)

		if (fixed === action.options.op) continue

		action.options.op = fixed
		result.updatedActions.push(action)
	}

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
					if (action.options.step === undefined) action.options.step = wrap(1)
					result.updatedActions.push(action)
					break
			}
		}
		return result
	},
	// Upgrade progress is tracked by index, so new scripts go last.
	fillOmittedOptions,
	dropUseVarToggles,
	repairPre201Writes,
	rescaleColorTemperatureStep,
	renameDebugToTrace,
	dropRestartCredentials,
	repairSteppedGain,
]
