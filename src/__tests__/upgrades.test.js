import { describe, expect, it } from 'vitest'
import { upgradeScripts } from '../upgrades.js'
import { getActionDefinitions } from '../actions.js'

// Companion validates every option an entity's definition declares, so a button that was built from
// a preset which named only the options it cared about cannot run: the ones it never got read back
// as undefined, and for a dropdown that is "not in the list of choices". New buttons are reconciled
// when the presets are handed out; these tests cover the repair of the buttons already on disk.

const fillOmittedOptions = upgradeScripts.at(-1)

// The button from the bug report: System - Power, dropped in from the preset, which stored only the
// operation and left the (hidden) value behind it unset.
const brokenPowerButton = () => ({ actionId: 'power', options: { op: 't' } })

const run = (props) => fillOmittedOptions({}, { config: { model: 'AW-UE100' }, feedbacks: [], ...props })

describe('fillOmittedOptions', () => {
	it('gives a value to the options a preset-built button never got', () => {
		const actions = [brokenPowerButton()]
		const result = run({ actions })

		expect(actions[0].options).toEqual({ op: 't', set: '0' })
		expect(result.updatedActions).toEqual(actions)
	})

	it('fills only from the action definition, so the value it writes is one Companion accepts', () => {
		const actions = [brokenPowerButton()]
		run({ actions })

		const field = getActionDefinitions({
			config: { model: 'AW-UE100' },
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}).power.options.find((o) => o.id === 'set')

		expect(field.choices.map((c) => c.id)).toContain(actions[0].options.set)
	})

	it('leaves a value the user picked alone', () => {
		const actions = [{ actionId: 'gain', options: { op: 's', set: '20' } }]
		const result = run({ actions })

		expect(actions[0].options.set).toBe('20')
		expect(result.updatedActions).toEqual([])
	})

	it('repairs feedbacks the same way', () => {
		const feedbacks = [{ feedbackId: 'shootingMode', options: {} }]
		const result = run({ actions: [], feedbacks })

		expect(feedbacks[0].options).toEqual({ option: '0' })
		expect(result.updatedFeedbacks).toEqual(feedbacks)
	})

	it('passes over an entity this module no longer defines', () => {
		const actions = [{ actionId: 'nothingDefinesThis', options: {} }]
		const result = run({ actions })

		expect(actions[0].options).toEqual({})
		expect(result.updatedActions).toEqual([])
	})

	// An upgrade script that throws takes the whole connection down, so it has to survive whatever
	// the stored config happens to be.
	it.each([
		['no config at all', null],
		['a model that is only resolved once a camera answers', { model: 'Auto' }],
		['a model this module does not know', { model: 'AW-NOT-A-CAMERA' }],
	])('survives %s', (_name, config) => {
		const actions = [brokenPowerButton(), { actionId: 'power' }]

		expect(() => run({ config, actions })).not.toThrow()
	})
})
