import { describe, expect, it } from 'vitest'
import { EmptyUpgradeScript } from '@companion-module/base'
import { upgradeScripts } from '../upgrades.js'
import { getActionDefinitions } from '../actions.js'

// Companion validates every declared option, so a preset-built button whose omitted options read
// back as undefined cannot run. These tests cover the repair of buttons already on disk.

// Pinned by index, not `.at(-1)`: Companion identifies a script by position, so appending one must
// not repoint these tests at the new arrival.
const addSetStepSize = upgradeScripts[1]
const fillOmittedOptions = upgradeScripts[2]
const dropUseVarToggles = upgradeScripts[3]

// An upgrade script both reads and writes CompanionMigrationOptionValues, so every option in these
// fixtures — and every option a script writes — is an ExpressionOrValue wrapper, never a bare value.
const val = (value) => ({ isExpression: false, value })
const expr = (value) => ({ isExpression: true, value })

// A preset-built button that stored only the operation, leaving the hidden value unset.
const brokenPowerButton = () => ({ actionId: 'power', options: { op: val('t') } })

const run = (props) => fillOmittedOptions({}, { config: { model: 'AW-UE100' }, feedbacks: [], ...props })
const migrate = (props) =>
	dropUseVarToggles({}, { config: { model: 'AW-UE100' }, actions: [], feedbacks: [], ...props })

// Scripts are identified by index, so one may only ever be appended — a removed or reordered script
// re-runs the wrong migration on every existing connection.
describe('upgradeScripts', () => {
	it('only ever grows, and blanks a retired script in place', () => {
		expect(upgradeScripts).toHaveLength(4)
		expect(upgradeScripts[0]).toBe(EmptyUpgradeScript)
	})
})

describe('addSetStepSize', () => {
	const step = (props) => addSetStepSize({}, { config: { model: 'AW-UE100' }, feedbacks: [], ...props })

	it('gives the speed actions a step size, in the value wrapper 2.0 requires', () => {
		const actions = [{ actionId: 'zoomSpeed', options: { op: val('i') } }]
		const result = step({ actions })

		expect(actions[0].options.step).toEqual(val(1))
		expect(result.updatedActions).toEqual(actions)
	})

	it('leaves a step size the button already carries alone', () => {
		const actions = [{ actionId: 'ptSpeed', options: { op: val('i'), step: val(5) } }]
		step({ actions })

		expect(actions[0].options.step).toEqual(val(5))
	})

	it('does not touch an action that has no step size', () => {
		const actions = [{ actionId: 'power', options: { op: val('t') } }]
		const result = step({ actions })

		expect(actions[0].options).toEqual({ op: val('t') })
		expect(result.updatedActions).toEqual([])
	})
})

describe('fillOmittedOptions', () => {
	it('gives a value to the options a preset-built button never got', () => {
		const actions = [brokenPowerButton()]
		const result = run({ actions })

		expect(actions[0].options).toEqual({ op: val('t'), set: val('0') })
		expect(result.updatedActions).toEqual(actions)
	})

	// A bare default reads back as `.value === undefined`, which is the very state — an option
	// Companion cannot parse, taking the whole action down — that this script exists to repair.
	it('writes the value wrapper 2.0 requires, not the bare default', () => {
		const actions = [brokenPowerButton()]
		run({ actions })

		expect(actions[0].options.set).toEqual({ isExpression: false, value: '0' })
	})

	it('fills only from the action definition, so the value it writes is one Companion accepts', () => {
		const actions = [brokenPowerButton()]
		run({ actions })

		const field = getActionDefinitions({
			config: { model: 'AW-UE100' },
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		}).power.options.find((o) => o.id === 'set')

		expect(field.choices.map((c) => c.id)).toContain(actions[0].options.set.value)
	})

	it('leaves a value the user picked alone', () => {
		const actions = [{ actionId: 'gain', options: { op: val('s'), set: val('20') } }]
		const result = run({ actions })

		expect(actions[0].options.set).toEqual(val('20'))
		expect(result.updatedActions).toEqual([])
	})

	it('repairs feedbacks the same way', () => {
		const feedbacks = [{ feedbackId: 'shootingMode', options: {} }]
		const result = run({ actions: [], feedbacks })

		expect(feedbacks[0].options).toEqual({ option: val('0') })
		expect(result.updatedFeedbacks).toEqual(feedbacks)
	})

	it('passes over an entity this module no longer defines', () => {
		const actions = [{ actionId: 'nothingDefinesThis', options: {} }]
		const result = run({ actions })

		expect(actions[0].options).toEqual({})
		expect(result.updatedActions).toEqual([])
	})

	// A script that throws takes the whole connection down, so it must survive any stored config.
	it.each([
		['no config at all', null],
		['a model that is only resolved once a camera answers', { model: 'Auto' }],
		['a model this module does not know', { model: 'AW-NOT-A-CAMERA' }],
	])('survives %s', (_name, config) => {
		const actions = [brokenPowerButton(), { actionId: 'power' }]

		expect(() => run({ config, actions })).not.toThrow()
	})
})

// The "Use Variable" checkbox and its parallel textinputs are gone (every field is expression-capable
// in 2.0). Where the checkbox was on, the textinput's value must survive as an expression on the plain field.
describe('dropUseVarToggles', () => {
	describe('with the checkbox on', () => {
		it('lifts a variable onto the plain field as an expression', () => {
			const actions = [
				{ actionId: 'iris', options: { op: val('s'), useVar: val(true), set: val(100), setVar: val('$(x)') } },
			]
			const result = migrate({ actions })

			expect(actions[0].options.set).toEqual(expr('$(x)'))
			expect(result.updatedActions).toEqual(actions)
		})

		it('turns a plain number back into a plain number, not an expression', () => {
			const actions = [{ actionId: 'iris', options: { useVar: val(true), set: val(100), setVar: val('5') } }]
			migrate({ actions })

			expect(actions[0].options.set).toEqual(val(5))
		})

		it('keeps the old value-mode reading of a concatenation rather than evaluating it', () => {
			// In value mode '$(a)+$(b)' interpolated to '3+4' and parseInt read 3, not 7.
			const actions = [{ actionId: 'iris', options: { useVar: val(true), setVar: val('$(a)+$(b)') } }]
			migrate({ actions })

			expect(actions[0].options.set).toEqual(expr('parseVariables("$(a)+$(b)")'))
		})

		it('migrates set and step, so switching the operation later still does what the user set up', () => {
			const actions = [
				{ actionId: 'iris', options: { op: val('s'), useVar: val(true), setVar: val('$(x)'), stepVar: val('7') } },
			]
			migrate({ actions })

			expect(actions[0].options.set).toEqual(expr('$(x)'))
			expect(actions[0].options.step).toEqual(val(7))
		})

		it('overwrites a plain field fillOmittedOptions had already defaulted', () => {
			// fillOmittedOptions runs first and may have written the default into `set`.
			const actions = [{ actionId: 'iris', options: { useVar: val(true), setVar: val('$(x)') } }]
			run({ actions: [actions[0]] })
			migrate({ actions })

			expect(actions[0].options.set).toEqual(expr('$(x)'))
		})
	})

	describe('preset number', () => {
		it('takes the offset off a migrated expression, since the option is 0-based', () => {
			const actions = [
				{ actionId: 'presetMem', options: { op: val('R'), useVar: val(true), valVar: expr('$(local:preset)') } },
			]
			migrate({ actions })

			expect(actions[0].options.val).toEqual(expr('($(local:preset)) - 1'))
		})

		it('resolves a literal straight back into the dropdown id it named', () => {
			const actions = [{ actionId: 'presetMem', options: { useVar: val(true), valVar: val('5') } }]
			migrate({ actions })

			expect(actions[0].options.val).toEqual(val('04'))
		})

		it('clamps a literal to a slot this model actually has', () => {
			const actions = [{ actionId: 'presetMem', options: { useVar: val(true), valVar: val('150') } }]
			migrate({ config: { model: 'AW-HE2' }, actions }) // the one camera with only nine slots

			expect(actions[0].options.val).toEqual(val('08'))
		})

		it('migrates the preset feedbacks the same way', () => {
			const feedbacks = [
				{ feedbackId: 'presetSelected', options: { useVar: val(true), optionVar: expr('$(local:preset)') } },
			]
			const result = migrate({ feedbacks })

			expect(feedbacks[0].options).toEqual({ option: expr('($(local:preset)) - 1') })
			expect(result.updatedFeedbacks).toEqual(feedbacks)
		})
	})

	describe('with the checkbox off', () => {
		it('keeps the plain field, which is what the button was using, and drops the dead keys', () => {
			const actions = [
				{ actionId: 'iris', options: { op: val('s'), useVar: val(false), set: val(100), setVar: val('$(x)') } },
			]
			const result = migrate({ actions })

			expect(actions[0].options).toEqual({ op: val('s'), set: val(100) })
			expect(result.updatedActions).toEqual(actions)
		})
	})

	it('reads the raw values the older scripts left on disk, not just the 2.0 wrapper', () => {
		const actions = [{ actionId: 'iris', options: { useVar: true, setVar: '$(x)' } }]
		migrate({ actions })

		expect(actions[0].options).toEqual({ set: expr('$(x)') })
	})

	it('leaves a button that never had the checkbox alone, and does not report it', () => {
		const actions = [{ actionId: 'iris', options: { op: val('s'), set: val(100) } }]
		const result = migrate({ actions })

		expect(actions[0].options).toEqual({ op: val('s'), set: val(100) })
		expect(result.updatedActions).toEqual([])
	})

	it.each([
		['no config at all', null],
		['a model that is only resolved once a camera answers', { model: 'Auto' }],
		['a model this module does not know', { model: 'AW-NOT-A-CAMERA' }],
	])('survives %s', (_name, config) => {
		const actions = [{ actionId: 'presetMem', options: { useVar: val(true), valVar: val('5') } }, { actionId: 'iris' }]

		expect(() => migrate({ config, actions })).not.toThrow()
	})
})
