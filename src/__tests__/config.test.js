import { describe, expect, it } from 'vitest'
import { ConfigFields, applyConfigDefaults, describeDetectedModel } from '../config.js'

// A config stores only the fields it was saved with, so a field added later reads `undefined`.
// applyConfigDefaults fills the gap from the field definitions, the one place defaults are written down.

const VALUE_FIELDS = ConfigFields.filter((f) => f.type !== 'static-text')

describe('config fields', () => {
	it('gives every field a default, so nothing can reach the module undefined', () => {
		for (const field of VALUE_FIELDS) {
			expect(field.default, field.id).toBeDefined()
		}
	})

	it('points every dropdown default at one of its own choices', () => {
		for (const field of VALUE_FIELDS.filter((f) => f.type === 'dropdown')) {
			expect(
				field.choices.map((c) => c.id),
				field.id,
			).toContain(field.default)
		}
	})

	it('keeps every number default within the range the field allows', () => {
		for (const field of VALUE_FIELDS.filter((f) => f.type === 'number')) {
			expect(field.default, field.id).toBeGreaterThanOrEqual(field.min)
			expect(field.default, field.id).toBeLessThanOrEqual(field.max)
		}
	})

	// Companion's config layout ignores `width`, so a static-text can no longer sit beside a setting to
	// explain it — the two just stack. Each field must explain itself instead.
	it('explains every setting on the field itself', () => {
		for (const field of VALUE_FIELDS) {
			expect(field.description, field.id).toBeTruthy()
		}
	})

	// The config is a flat list with no `structure`, so a static-text divider is the only way to group
	// settings. That is now their only allowed job.
	it('uses static text only to divide the sections, or for the one field filled in at runtime', () => {
		const staticText = ConfigFields.filter((f) => f.type === 'static-text').map((f) => f.id)

		expect(staticText).toEqual([
			'sectionModel',
			'modelDetected',
			'sectionUpdates',
			'sectionImage',
			'sectionDiagnostics',
		])
	})

	it('rules off each section with nothing but a full-width divider', () => {
		// A run of '─' is a fixed length and could not span a panel of any width.
		for (const field of ConfigFields.filter((f) => f.id.startsWith('section'))) {
			expect(field.value, field.id).toBe('<hr>')
		}
	})

	it('keeps each subject together, in the order the dividers set out', () => {
		// Fields must not jump back and forth between subjects. The first group needs no divider.
		const grouped = { connection: [] }
		let current = 'connection'

		for (const field of ConfigFields) {
			if (field.id.startsWith('section')) current = field.id
			else (grouped[current] ??= []).push(field.id)
		}

		expect(grouped).toEqual({
			connection: ['host', 'httpPort', 'timeout'],
			sectionModel: ['model', 'modelDetected'],
			sectionUpdates: ['subscriptionEnable', 'portManual', 'tcpPort', 'pollAllow', 'pollDelay'],
			// Scaling comes first and is unconditional: it governs the preset thumbnails too, not just the live image.
			sectionImage: ['imageScaling', 'imageEnable', 'imageInterval'],
			sectionDiagnostics: ['debug'],
		})
	})

	it('labels each field by what the setting is, not by what the widget does', () => {
		for (const field of VALUE_FIELDS) {
			expect(['Enable', 'Allow', 'Manual'], field.id).not.toContain(field.label)
		}
	})

	// CompanionInputFieldBase.isVisibleExpression may only reference fields with disableAutoExpression;
	// break it and the expression fails to resolve, so the field can vanish from the panel entirely.
	it('only lets a visibility expression depend on a field that opted out of expressions', () => {
		const byId = new Map(ConfigFields.map((f) => [f.id, f]))

		for (const field of ConfigFields.filter((f) => f.isVisibleExpression)) {
			const referenced = [...field.isVisibleExpression.matchAll(/\$\(options:(\w+)\)/g)].map((m) => m[1])

			expect(referenced.length, `${field.id} references no field at all`).toBeGreaterThan(0)

			for (const id of referenced) {
				expect(byId.has(id), `${field.id} references unknown field ${id}`).toBe(true)
				expect(byId.get(id).disableAutoExpression, `${field.id} references ${id}`).toBe(true)
			}
		}
	})

	it('hides only fields that are meaningless while their parent is off', () => {
		const hidden = ConfigFields.filter((f) => f.isVisibleExpression).map((f) => f.id)

		expect(hidden).toEqual(['portManual', 'tcpPort', 'pollDelay', 'imageInterval'])
	})
})

describe('applyConfigDefaults', () => {
	it('fills a config saved before a field existed', () => {
		const filled = applyConfigDefaults({ host: '10.0.0.1' })

		expect(filled.imageEnable).toBe(true)
		expect(filled.imageInterval).toBe(1000)
		expect(filled.imageScaling).toBe('letterbox')
	})

	it('leaves every field defined, even for a connection that has never been saved', () => {
		const filled = applyConfigDefaults({})

		for (const field of VALUE_FIELDS) {
			expect(filled[field.id], field.id).toBeDefined()
		}
	})

	it('never overwrites what the user chose', () => {
		const stored = { host: '10.0.0.2', httpPort: 8080, imageEnable: true, imageInterval: 2500 }

		expect(applyConfigDefaults(stored)).toMatchObject(stored)
	})

	it('keeps a deliberate false or 0 rather than reading it as missing', () => {
		// pollAllow defaults to true, so `||` would wrongly turn a user's `false` back on.
		const filled = applyConfigDefaults({ pollAllow: false, subscriptionEnable: false })

		expect(filled.pollAllow).toBe(false)
		expect(filled.subscriptionEnable).toBe(false)
	})

	it('does not invent config values out of the static text blocks', () => {
		const filled = applyConfigDefaults({})

		for (const field of ConfigFields.filter((f) => f.type === 'static-text')) {
			expect(filled, field.id).not.toHaveProperty(field.id)
		}
	})

	it('still defines the fields the panel currently hides', () => {
		// Visibility is a UI concern: the module reads pollDelay even when polling is off (it sizes the
		// reconnect timer), so a hidden field must still hold a usable value.
		const filled = applyConfigDefaults({ pollAllow: false, imageEnable: false, subscriptionEnable: false })

		expect(filled.pollDelay).toBe(100)
		expect(filled.imageInterval).toBe(1000)
		expect(filled.tcpPort).toBe(31004)
	})
})

// Only a hand-picked model the camera disagrees with is marked a warning; everything else is
// information. Companion strips style attributes from static text, so the mark lives in the text itself.
const isWarning = (text) => text.startsWith('⚠')

describe('describeDetectedModel', () => {
	it('says so plainly while the camera has not answered', () => {
		const text = describeDetectedModel({ model: 'Auto' }, { modelAuto: null })

		expect(text).toMatch(/nothing detected yet/i)
		expect(isWarning(text)).toBe(false)
	})

	it('survives being asked before the instance has initialised', () => {
		// Companion can open the config panel of a connection that never came up.
		expect(() => describeDetectedModel(undefined, undefined)).not.toThrow()
	})

	it('names the camera it found', () => {
		const text = describeDetectedModel({ model: 'Auto' }, { modelAuto: 'AW-UE80' })

		expect(text).toContain('AW-UE80')
		expect(isWarning(text)).toBe(false)
	})

	it('marks a hand-picked model the camera disagrees with', () => {
		// The failure this field exists for: buttons built for a UE150 driving a UE80.
		const text = describeDetectedModel({ model: 'AW-UE150' }, { modelAuto: 'AW-UE80' })

		expect(text).toContain('AW-UE80') // what the camera really is
		expect(text).toContain('AW-UE150') // what it is being driven as
		expect(isWarning(text)).toBe(true)
	})

	it('stays quiet about a mismatch the user did not cause', () => {
		expect(isWarning(describeDetectedModel({ model: 'AW-UE80' }, { modelAuto: 'AW-UE80' }))).toBe(false)
	})

	it('never warns on Auto or Other, which cannot disagree with the camera', () => {
		// Auto follows the camera; Other is a deliberate generic fallback. Neither is a wrong pick.
		for (const model of ['Auto', 'Other']) {
			expect(isWarning(describeDetectedModel({ model }, { modelAuto: 'AW-UE80' })), model).toBe(false)
		}
	})

	it('warns when the camera is one this module does not list', () => {
		const text = describeDetectedModel({ model: 'Auto' }, { modelAuto: 'AW-XX999' })

		expect(text).toContain('AW-XX999')
		expect(text).toMatch(/Other Cameras/)
	})

	it('still flags the mismatch when the camera it found is also unknown', () => {
		// The unknown-model notice must not swallow the warning: a pinned model is still being driven
		// against a camera that is not it.
		const text = describeDetectedModel({ model: 'AW-UE150' }, { modelAuto: 'AW-XX999' })

		expect(text).toContain('AW-XX999')
		expect(isWarning(text)).toBe(true)
	})
})
