import { describe, expect, it } from 'vitest'
import { getActionDefinitions } from '../actions.js'

// The action callbacks are what actually reach the camera, so these assert the command string rather
// than the definition around it. `self.getCam` is the only transport these actions use.
function mockInstance(model) {
	const sent = []
	const self = {
		config: { model },
		data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
		getCam: (cmd) => sent.push(cmd),
		log: () => {},
		sent,
	}
	return self
}

// options arrive from Companion already resolved to plain values, not ExpressionOrValue wrappers.
async function run(model, options) {
	const self = mockInstance(model)
	await getActionDefinitions(self).colorTemperature.callback({ actionId: 'colorTemperature', options })
	return self.sent
}

// OSI:1E/OSI:1F carry a count of the camera's own notches (1h-Ah per the compatible model table),
// not a Kelvin delta. v2.0.x validated the step size and then sent a hardcoded ':1' regardless,
// which is what issue #83 reported as "increase/decrease not working".
describe('colorTemperature on a camera that can set and step (AW-UE150A)', () => {
	it('sends the requested number of notches', async () => {
		expect(await run('AW-UE150A', { op: 1, step: 3 })).toEqual(['OSI:1E:3'])
		expect(await run('AW-UE150A', { op: -1, step: 3 })).toEqual(['OSI:1F:3'])
	})

	it('sends a single notch by default', async () => {
		expect(await run('AW-UE150A', { op: 1, step: 1 })).toEqual(['OSI:1E:1'])
	})

	it('writes the top of the range as a hex digit', async () => {
		expect(await run('AW-UE150A', { op: 1, step: 10 })).toEqual(['OSI:1E:A'])
	})

	it('constrains a step outside the range instead of sending an unencodable one', async () => {
		expect(await run('AW-UE150A', { op: 1, step: 999 })).toEqual(['OSI:1E:A'])
		expect(await run('AW-UE150A', { op: 1, step: 0 })).toEqual(['OSI:1E:1'])
	})

	// A button stored before the unit changed carries a Kelvin step; the upgrade script rewrites it,
	// but a value that slips through must still produce a command the camera accepts.
	it('constrains a stored Kelvin step to a valid notch count', async () => {
		expect(await run('AW-UE150A', { op: 1, step: 20 })).toEqual(['OSI:1E:A'])
	})

	it('sends nothing when the step does not resolve to a number', async () => {
		expect(await run('AW-UE150A', { op: 1, step: 'nope' })).toEqual([])
	})

	it('still sets an absolute value in Kelvin', async () => {
		expect(await run('AW-UE150A', { op: 's', set: 4000 })).toEqual(['OSI:20:00FA0:0'])
	})

	it('constrains an absolute value to the model range', async () => {
		expect(await run('AW-UE150A', { op: 's', set: 99999 })).toEqual(['OSI:20:03A98:0'])
		expect(await run('AW-UE150A', { op: 's', set: 0 })).toEqual(['OSI:20:007D0:0'])
	})

	it('offers the step size in notches and the value in Kelvin', () => {
		const options = getActionDefinitions(mockInstance('AW-UE150A')).colorTemperature.options
		const byId = Object.fromEntries(options.map((field) => [field.id, field]))

		expect(byId.step).toMatchObject({ label: 'Steps', default: 1, min: 1, max: 10 })
		expect(byId.set).toMatchObject({ min: 2000, max: 15000 })
	})
})

// The AK-UB300 has no OSI:20 set command and takes only 1h, so it gets the relative-only options.
describe('colorTemperature on a camera that can only step (AK-UB300)', () => {
	it('sends one notch in either direction', async () => {
		expect(await run('AK-UB300', { op: 1 })).toEqual(['OSI:1E:1'])
		expect(await run('AK-UB300', { op: -1 })).toEqual(['OSI:1F:1'])
	})

	it('offers no value or step field to get out of range', () => {
		const options = getActionDefinitions(mockInstance('AK-UB300')).colorTemperature.options

		expect(options.map((field) => field.id)).toEqual(['op'])
	})
})

// Every other stepped action shares optSetStepped/resolveSetStep with colour temperature, so the
// stepRange parameter added for the notch count must leave them measuring in their own unit.
describe('the shared stepped options', () => {
	it('keeps the step size in the value unit where no notch range is given', () => {
		const options = getActionDefinitions(mockInstance('AW-UE150A')).ped.options
		const byId = Object.fromEntries(options.map((field) => [field.id, field]))

		expect(byId.step).toMatchObject({ label: 'Step size', default: 1, min: 1 })
		expect(byId.step.max).toBe(byId.set.max - byId.set.min)
	})
})
