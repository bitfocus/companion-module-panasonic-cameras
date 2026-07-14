import { describe, expect, it } from 'vitest'
import { MODELS, SERIES_SPECS } from '../models.js'
import { getPresetDefinitions } from '../presets.js'
import { getActionDefinitions } from '../actions.js'
import { getFeedbackDefinitions } from '../feedbacks.js'
import { setVariables } from '../variables.js'

// The option field types module-base 2.x accepts.
const FIELD_TYPES = [
	'static-text',
	'textinput',
	'dropdown',
	'multidropdown',
	'colorpicker',
	'number',
	'checkbox',
	'custom-variable',
	'bonjour-device',
	'secret-text',
]

// Properties that existed in module-base 1.x and were removed in 2.0. Each of these shipped in
// this module at some point, so they are worth pinning rather than trusting a one-off grep.
const REMOVED_FIELD_PROPS = ['isVisible', 'required']
const REMOVED_PRESET_OPTIONS = ['relativeDelay', 'rotaryActions']

// The module used to hand-build a "Use Variable" checkbox that swapped a field for a parallel
// textinput. In 2.0 every field can be toggled into expression mode on its own, so the construct is
// gone; these are the option ids it left behind (see dropUseVarToggles in upgrades.js).
const REMOVED_OPTION_IDS = ['useVar', 'setVar', 'stepVar', 'valVar', 'optionVar']

// The fields whose value a callback parses and constrains itself: the stepped number inputs (marked
// by `asInteger`, which only that builder sets) and the preset dropdown. Other number fields are
// deliberately not in here — nothing constrains them, so Companion rejecting an out-of-range
// expression is exactly what should happen.
const isConstrained = (field) =>
	(field.type === 'number' && field.asInteger) ||
	(field.type === 'dropdown' && field.choices?.[0]?.label?.startsWith('Preset '))

// One representative model per series, so every capability branch gets built.
const seenSeries = new Set()
const MODELS_BY_SERIES = MODELS.filter((m) => m.id !== 'Auto' && !seenSeries.has(m.series) && seenSeries.add(m.series))

function mockInstance(model) {
	return { config: { model }, data: { model: null, modelAuto: null, series: null, presetThumbnails: [] } }
}

function seriesSpec(series) {
	return SERIES_SPECS.find((s) => s.id === series)
}

describe.each(MODELS_BY_SERIES)('series $series (via $id)', ({ id, series }) => {
	const self = mockInstance(id)
	const caps = seriesSpec(series).capabilities

	const { structure, presets } = getPresetDefinitions(self)
	const actions = getActionDefinitions(self)
	const feedbacks = getFeedbackDefinitions(self)
	const variables = setVariables(self)

	const allFields = [...Object.entries(actions), ...Object.entries(feedbacks)].flatMap(([defId, def]) =>
		(def.options ?? []).map((field) => [defId, field]),
	)

	describe('presets', () => {
		it('only emits `simple` presets, with no leftover 1.x properties', () => {
			for (const [presetId, preset] of Object.entries(presets)) {
				expect(preset.type, presetId).toBe('simple')
				expect(preset, presetId).not.toHaveProperty('category')
				expect(preset, presetId).not.toHaveProperty('template')
				for (const prop of REMOVED_PRESET_OPTIONS) {
					expect(preset.options ?? {}, `${presetId}.options.${prop}`).not.toHaveProperty(prop)
				}
			}
		})

		it('references every preset from exactly one section, and nothing dangling', () => {
			const referenced = []
			for (const section of structure) {
				expect(section.id, section.name).toBeTruthy()
				for (const entry of section.definitions) {
					// A section holds either bare preset ids or groups, never a mix of the two.
					referenced.push(...(typeof entry === 'string' ? [entry] : (entry.presets ?? [entry.presetId])))
				}
			}
			expect([...referenced].sort()).toEqual(Object.keys(presets).sort())
		})

		it('never mixes bare preset ids and groups within one section', () => {
			for (const section of structure) {
				const kinds = new Set(section.definitions.map((d) => typeof d === 'string'))
				expect(kinds.size, `section ${section.id}`).toBeLessThanOrEqual(1)
			}
		})
	})

	describe('preset entities', () => {
		// Companion parses every option a stored entity carries against its field definition, and it
		// does not fall back to the default for one that was never set: for a dropdown, undefined is
		// simply not in the list of choices, and the action fails to run. So a preset button is only
		// as valid as the weakest option on it — an omitted option, a step below the model's own step
		// size, or an action the model does not have at all each take the whole button down.
		const presetEntities = Object.entries(presets).flatMap(([presetId, preset]) => [
			...(preset.steps ?? []).flatMap((step) =>
				Object.values(step)
					.filter(Array.isArray)
					.flatMap((set) => set.map((action) => [presetId, 'action', action.actionId, action.options, actions])),
			),
			...(preset.feedbacks ?? []).map((fb) => [presetId, 'feedback', fb.feedbackId, fb.options, feedbacks]),
		])

		it('only references actions and feedbacks this model actually has', () => {
			for (const [presetId, kind, entityId, , definitions] of presetEntities) {
				expect(definitions[entityId], `${presetId} uses ${kind} ${entityId}`).toBeDefined()
			}
		})

		it('carries no option the model does not have', () => {
			// A preset is written once for every model, so it can name an option — a step size, say —
			// that a given model's action does not offer at all.
			for (const [presetId, kind, entityId, options, definitions] of presetEntities) {
				const known = (definitions[entityId]?.options ?? []).map((field) => field.id)
				for (const id of Object.keys(options ?? {})) {
					expect(known, `${presetId}: ${kind} ${entityId} has no option ${id}`).toContain(id)
				}
			}
		})

		it('gives every option of every preset entity a value its own definition accepts', () => {
			for (const [presetId, kind, entityId, options, definitions] of presetEntities) {
				for (const field of definitions[entityId]?.options ?? []) {
					if (field.type === 'static-text') continue
					const value = options?.[field.id]
					const where = `${presetId}: ${kind} ${entityId}.${field.id}`

					expect(value, `${where} is not set`).toBeDefined()
					// An expression is only resolved on the button, so there is nothing to check here.
					if (value?.isExpression) continue

					if (field.type === 'dropdown') {
						expect(
							field.choices.map((c) => c.id),
							where,
						).toContain(value)
					}
					if (field.type === 'number') {
						expect(value, where).toBeGreaterThanOrEqual(field.min ?? -Infinity)
						expect(value, where).toBeLessThanOrEqual(field.max ?? Infinity)
					}
				}
			}
		})
	})

	describe('preset templates', () => {
		const templates = structure.flatMap((s) => s.definitions.filter((d) => d.type === 'template'))

		it('fans preset memory out over the slots this model actually has', () => {
			if (!caps.preset) return expect(templates.find((t) => t.presetId === 'preset-memory')).toBeUndefined()

			const template = templates.find((t) => t.presetId === 'preset-memory')
			expect(template).toBeDefined()
			// The old hardcoded loop always emitted 100 buttons, even on a 9-preset camera.
			expect(template.templateValues).toHaveLength(caps.preset)
			expect(template.templateValues.at(0).value).toBe(1)
			expect(template.templateValues.at(-1).value).toBe(caps.preset)
		})

		it('declares a local variable for every templated variable name', () => {
			for (const template of templates) {
				const names = (presets[template.presetId].localVariables ?? []).map((v) => v.variableName)
				expect(names, template.id).toContain(template.templateVariableName)
			}
		})
	})

	describe('option fields', () => {
		it('uses only field types that module-base 2.x knows', () => {
			for (const [defId, field] of allFields) {
				expect(FIELD_TYPES, `${defId}.${field.id}`).toContain(field.type)
			}
		})

		it('carries no properties that were removed in 2.0', () => {
			for (const [defId, field] of allFields) {
				for (const prop of REMOVED_FIELD_PROPS) {
					expect(field, `${defId}.${field.id}`).not.toHaveProperty(prop)
				}
			}
		})

		it('builds no "Use Variable" companion field, because every field can be one', () => {
			for (const [defId, field] of allFields) {
				expect(REMOVED_OPTION_IDS, `${defId} still declares ${field.id}`).not.toContain(field.id)
			}
		})

		it('lets every field the callbacks constrain hold what an expression produced', () => {
			// resolveSetStep and parsePresetNumber parse and clamp these values themselves. Without
			// `allowInvalidValues` Companion drops the whole entity before the callback ever sees one it
			// considers invalid — and on the preset dropdown that is not an edge case but the normal
			// path: the templated preset buttons drive it from an expression, which yields the number 4
			// where the choice ids are the strings '00'..'99'.
			const constrained = allFields.filter(([, field]) => isConstrained(field))
			expect(constrained.length).toBeGreaterThan(0)

			for (const [defId, field] of constrained) {
				expect(field.allowInvalidValues, `${defId}.${field.id}`).toBe(true)
			}
		})

		it('lets every conditionally-visible field hold an empty value', () => {
			// Companion validates a stored option whether or not the field is currently shown. A field
			// behind an isVisibleExpression is legitimately empty while its condition is off — the user
			// never filled it in — so any rule that rejects "" makes the whole entity fail to parse and
			// the button stops working.
			//
			// In 1.x both `required` and `regex` were advisory. In 2.0 `minLength` and `regex` are
			// enforced, so mechanically carrying them over broke every saved button that drove its
			// option from the dropdown rather than a variable.
			for (const [defId, field] of allFields) {
				if (!field.isVisibleExpression) continue
				const where = `${defId}.${field.id} is only shown when ${field.isVisibleExpression}`

				expect(field.minLength ?? 0, where).toBe(0)
				if (field.regex) {
					const body = field.regex.slice(1, field.regex.lastIndexOf('/'))
					const flags = field.regex.slice(field.regex.lastIndexOf('/') + 1)
					expect(new RegExp(body, flags).test(''), `${where}, but its regex rejects an empty value`).toBe(true)
				}
			}
		})

		it('only lets isVisibleExpression read fields that opted out of auto-expression', () => {
			for (const [defId, def] of [...Object.entries(actions), ...Object.entries(feedbacks)]) {
				for (const field of def.options ?? []) {
					if (typeof field.isVisibleExpression !== 'string') continue
					const referenced = [...field.isVisibleExpression.matchAll(/\$\(options:(\w+)\)/g)].map((m) => m[1])
					for (const name of referenced) {
						// A field that can itself hold an expression cannot be read back reliably,
						// so anything an isVisibleExpression depends on must set disableAutoExpression.
						const target = def.options.find((o) => o.id === name)
						expect(target, `${defId}.${field.id} -> ${name}`).toBeDefined()
						expect(target.disableAutoExpression, `${defId}.${field.id} -> ${name}`).toBe(true)
					}
				}
			}
		})
	})

	describe('feedbacks', () => {
		it('gives every boolean feedback a defaultStyle and drops the removed subscribe hook', () => {
			for (const [feedbackId, def] of Object.entries(feedbacks)) {
				expect(['boolean', 'advanced', 'value'], feedbackId).toContain(def.type)
				if (def.type === 'boolean') expect(def.defaultStyle, feedbackId).toBeDefined()
				expect(def, feedbackId).not.toHaveProperty('subscribe')
			}
		})
	})

	describe('variables', () => {
		it('is keyed by variableId rather than being a 1.x array', () => {
			expect(Array.isArray(variables)).toBe(false)
			for (const [variableId, def] of Object.entries(variables)) {
				expect(def.name, variableId).toBeTypeOf('string')
				expect(def, variableId).not.toHaveProperty('variableId')
			}
		})
	})
})
