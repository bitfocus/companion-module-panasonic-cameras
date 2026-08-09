import { describe, expect, it } from 'vitest'
import { getActionDefinitions } from '../actions.js'

// The action callbacks are what actually reach the camera, so these assert the command string rather
// than the definition around it. Iris is the one that picks its transport from the capability, so
// both are recorded, tagged with the endpoint they went to.
function mockInstance(model, data = {}) {
	const sent = []
	const self = {
		config: { model },
		data: { model: null, modelAuto: null, series: null, presetThumbnails: [], ...data },
		getCam: (cmd) => sent.push(cmd),
		getPTZ: (cmd) => sent.push('#' + cmd),
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

// A pan/tilt head drives the iris over aw_ptz with #AXI (555h-FFFh); a box camera has no head and
// drives the lens over aw_cam with ORV (000h-3FFh). No model has both, so they share irisPosition and
// the capability carries the numbers. Splitting them left the box cameras' `$(irisPositionBar)` -
// which the shipped Iris preset puts on the button - permanently empty.
describe('iris, which reaches the lens by two different roads', () => {
	const iris = async (model, options, data) => {
		const self = mockInstance(model, data)
		await getActionDefinitions(self).iris.callback({ actionId: 'iris', options })
		return self.sent
	}

	it('drives the head over aw_ptz, offset by 0x555', async () => {
		expect(await iris('AW-UE150', { op: 's', set: 0x0 })).toEqual(['#AXI555'])
		expect(await iris('AW-UE150', { op: 's', set: 0xaaa })).toEqual(['#AXIFFF'])
	})

	it('drives a box camera lens over aw_cam, with no offset', async () => {
		expect(await iris('AK-UB300', { op: 's', set: 0x0 })).toEqual(['ORV:000'])
		expect(await iris('AK-UB300', { op: 's', set: 0x3ff })).toEqual(['ORV:3FF'])
	})

	it('steps from the one position field, whichever road it came in on', async () => {
		expect(await iris('AW-UE150', { op: 1, step: 0x1e }, { irisPosition: 0x100 })).toEqual(['#AXI673'])
		expect(await iris('AK-UB300', { op: 1, step: 0xa }, { irisPosition: 0x100 })).toEqual(['ORV:10A'])
	})

	it('offers each model its own range rather than one borrowed from the other', () => {
		const range = (model) => {
			const set = getActionDefinitions(mockInstance(model)).iris.options.find((f) => f.id === 'set')
			return [set.min, set.max, set.default]
		}

		expect(range('AW-UE150')).toEqual([0x0, 0xaaa, 0x555])
		expect(range('AK-UB300')).toEqual([0x0, 0x3ff, 0x1ff])
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
