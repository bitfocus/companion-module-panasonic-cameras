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
