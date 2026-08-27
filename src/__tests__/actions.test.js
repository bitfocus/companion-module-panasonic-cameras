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

// The camera drives its movement range limits with #LC[direction][state] - four independent booleans.
// The #L toggle would look like a better fit but its reply carries no direction, so nothing could
// follow it; toggling is done here instead, against the state the camera last reported.
describe('the movement range limit', () => {
	const limit = async (options, data) => {
		const self = mockInstance('AW-UE150', { panTiltLimits: [null, null, null, null], ...data })
		await getActionDefinitions(self).ptLimit.callback({ actionId: 'ptLimit', options })
		return self.sent
	}

	it('switches one direction at a time', async () => {
		expect(await limit({ dir: '1', op: 's', set: '1' })).toEqual(['#LC11'])
		expect(await limit({ dir: '4', op: 's', set: '0' })).toEqual(['#LC40'])
	})

	it('toggles against what the camera last reported', async () => {
		expect(await limit({ dir: '1', op: 't' }, { panTiltLimits: ['0', null, null, null] })).toEqual(['#LC11'])
		expect(await limit({ dir: '1', op: 't' }, { panTiltLimits: ['1', null, null, null] })).toEqual(['#LC10'])
	})

	it('is not offered on a camera with no pan/tilt head', () => {
		expect(getActionDefinitions(mockInstance('AK-UB300')).ptLimit).toBeUndefined()
		expect(getActionDefinitions(mockInstance('AW-UE4')).ptLimit).toBeUndefined()
	})
})

// Chroma phase and noise reduction sit on OSJ:0B/OSD:3A everywhere except the POVCAM, which carries
// them on OSK:03/OSK:05. The command moved into the capability so both can be served; these pin the
// string that actually leaves, because building the action proves nothing about what it sends.
describe('the commands that differ per model', () => {
	const fire = async (model, id, options, data) => {
		const self = mockInstance(model, data)
		await getActionDefinitions(self)[id].callback({ actionId: id, options })
		return self.sent
	}

	// Centred on 0x80. POVCAM's own table prints 62h for -31, but 9Fh is +31 and the HD Integrated
	// specification gives 61h, so the low end is symmetric and that 62h is a slip in the POVCAM PDF.
	it('sends chroma phase on the command the model uses', async () => {
		expect(await fire('AG-UCK20', 'chromaPhase', { op: 's', set: 0 })).toEqual(['OSK:03:80'])
		expect(await fire('AG-UCK20', 'chromaPhase', { op: 's', set: 31 })).toEqual(['OSK:03:9F'])
		expect(await fire('AG-UCK20', 'chromaPhase', { op: 's', set: -31 })).toEqual(['OSK:03:61'])

		expect(await fire('AW-UE150A', 'chromaPhase', { op: 's', set: 0 })).toEqual(['OSJ:0B:80'])
		expect(await fire('AW-UE150A', 'chromaPhase', { op: 's', set: 31 })).toEqual(['OSJ:0B:9F'])
	})

	it('sends noise reduction on the command the model uses', async () => {
		// POVCAM sets a level centred on 0x80; every other model picks one of three steps.
		expect(await fire('AG-UCK20', 'dnr', { op: 's', set: '80' })).toEqual(['OSK:05:80'])
		expect(await fire('AG-UCK20', 'dnr', { op: 's', set: '87' })).toEqual(['OSK:05:87'])

		expect(await fire('AW-HE130', 'dnr', { op: 's', set: '02' })).toEqual(['OSD:3A:02'])
		expect(await fire('AW-UE160', 'dnr', { op: 's', set: '1' })).toEqual(['OSD:3A:1'])
	})

	// Stepping reads the camera's last reported value, so a wrong command would also mean stepping
	// from the wrong state rather than only writing to the wrong place.
	it('steps from the reported value on the same command', async () => {
		expect(await fire('AG-UCK20', 'dnr', { op: 1 }, { dnr: '80' })).toEqual(['OSK:05:81'])
		expect(await fire('AW-HE130', 'dnr', { op: 1 }, { dnr: '00' })).toEqual(['OSD:3A:01'])
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

// $(customResponse) is documented as the answer to the command sent last, and Companion runs action
// callbacks concurrently. Without a guard the slower of two overlapping requests wins simply by
// finishing later, so a query fired from a second button could leave the first one's answer behind.
describe('Custom Command responses', () => {
	function harness(model = 'AW-UE150A') {
		const self = {
			config: { model },
			data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
			getCam: (cmd) => self.answers[cmd],
			checkVariables: () => {},
			log: () => {},
			answers: {},
		}
		return self
	}

	const send = (self, cmd) =>
		getActionDefinitions(self).customCommand.callback({ actionId: 'customCommand', options: { dest: 0, cmd } })

	it('keeps the answer to the command sent last, however the two resolve', async () => {
		const self = harness()
		let releaseSlow
		self.answers.QID = new Promise((resolve) => (releaseSlow = resolve))
		self.answers.QAW = Promise.resolve('OAW:9')

		const slow = send(self, 'QID') // fired first, answers last
		await send(self, 'QAW')
		releaseSlow('OID:AW-UE150')
		await slow

		expect(self.data.customResponse).toBe('OAW:9')
	})

	it('still publishes an answer that arrives on its own', async () => {
		const self = harness()
		self.answers.QID = Promise.resolve('OID:AW-UE150')

		await send(self, 'QID')

		expect(self.data.customResponse).toBe('OID:AW-UE150')
	})

	it('clears the variable when a request comes back empty', async () => {
		const self = harness()
		self.answers.QID = Promise.resolve(undefined)

		await send(self, 'QID')

		expect(self.data.customResponse).toBeNull()
	})
})

// OSA:87 is the one setting whose valid values depend on another setting: the camera answers ER3 to a
// format that belongs to a different system frequency. The choice lists are therefore per model and
// ordered by frequency group, and OSE:77 is the only way to reach another group at all.
describe('the video format', () => {
	const format = (model, options, data = {}) => {
		const self = mockInstance(model, data)
		return Promise.resolve(getActionDefinitions(self).videoFormat.callback({ actionId: 'videoFormat', options })).then(
			() => self.sent,
		)
	}

	it('sets a format by its two-digit value', async () => {
		expect(await format('AW-UE160', { op: 's', set: '11' })).toEqual(['OSA:87:11'])
		expect(await format('AW-HE130', { op: 's', set: '0A' })).toEqual(['OSA:87:0A'])
	})

	// The lists are concatenated frequency group by frequency group, so a step lands on a format the
	// camera can actually take until the end of that group is reached.
	it('steps within the frequency group it starts in', async () => {
		expect(await format('AW-UE160', { op: 1 }, { videoFormat: '01' })).toEqual(['OSA:87:10'])
		expect(await format('AW-UE160', { op: 1 }, { videoFormat: '10' })).toEqual(['OSA:87:14'])
		expect(await format('AW-UE160', { op: -1 }, { videoFormat: '15' })).toEqual(['OSA:87:11'])
	})

	it('offers each model only the formats its specification lists', () => {
		const choices = (model) =>
			getActionDefinitions(mockInstance(model))
				.videoFormat.options.find((o) => o.id === 'set')
				.choices.map((c) => c.id)

		expect(choices('AW-UE160')).toEqual([
			'01',
			'10',
			'14',
			'17',
			'19',
			'26',
			'02',
			'11',
			'15',
			'18',
			'1A',
			'27',
			'21',
			'22',
			'1B',
			'23',
			'1F',
			'20',
		])
		expect(choices('AW-HE2')).toEqual(['01', '04', '10', '12', '02', '05', '11', '13'])
		// Auto is a control-only value on these, so it sits outside the frequency groups, at the end.
		expect(choices('AW-UE70').at(-1)).toBe('80')
	})

	// The AK-UB10/UB50 report the format but have no control command for it, and the AG-CX350 line has
	// neither - offering the action there would only earn an ER1.
	it('is not offered where the camera cannot be told', () => {
		expect(getActionDefinitions(mockInstance('AK-UB50'))).not.toHaveProperty('videoFormat')
		expect(getActionDefinitions(mockInstance('AG-CX350'))).not.toHaveProperty('videoFormat')
	})
})

describe('the system frequency', () => {
	const frequency = (model, options) => {
		const self = mockInstance(model)
		return Promise.resolve(getActionDefinitions(self).frequency.callback({ actionId: 'frequency', options })).then(
			() => self.sent,
		)
	}

	it('sets the frequency once the change is confirmed', async () => {
		expect(await frequency('AW-UE160', { set: '1', confirm: true })).toEqual(['OSE:77:1'])
		expect(await frequency('AW-UE160', { set: '4', confirm: true })).toEqual(['OSE:77:4'])
	})

	// It reboots the camera on most models, so an unchecked button has to be a no-op rather than a
	// surprise - same guard as Preset - Clear All.
	it('sends nothing without the confirmation', async () => {
		expect(await frequency('AW-UE160', { set: '1', confirm: false })).toEqual([])
	})

	it('offers each model only the frequencies it has', () => {
		const choices = (model) =>
			getActionDefinitions(mockInstance(model))
				.frequency.options.find((o) => o.id === 'set')
				.choices.map((c) => c.id)

		expect(choices('AW-UE160')).toEqual(['0', '1', '2', '3', '4'])
		expect(choices('AW-UE100')).toEqual(['0', '1', '2', '3'])
		expect(choices('AW-UE20')).toEqual(['0', '1', '4'])
		expect(choices('AW-HE130')).toEqual(['0', '1'])
	})

	it('is not offered where the camera has no frequency setting', () => {
		for (const model of ['AK-UB50', 'AK-UB300', 'AG-CX350']) {
			expect(getActionDefinitions(mockInstance(model)), model).not.toHaveProperty('frequency')
		}
	})
})
