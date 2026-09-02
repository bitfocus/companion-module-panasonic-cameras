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
		checkVariables: () => {},
		checkAllFeedbacks: () => {},
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

// A pan/tilt head drives the iris over aw_ptz with #AXI (555h-FFFh). The box cameras drive it over
// aw_cam with ORV (000h-3FFh) but also report it on the lens scale in OSI:18, and both landed in
// irisPosition - so a step read one scale, wrote the other and hit the clamp, opening the iris fully
// (issue #97). Their iris rests until it can be rebuilt together with their zoom and focus.
describe('iris, which only a pan/tilt head has for now', () => {
	const iris = async (model, options, data) => {
		const self = mockInstance(model, data)
		await getActionDefinitions(self).iris.callback({ actionId: 'iris', options })
		return self.sent
	}

	it('drives the head over aw_ptz, offset by 0x555', async () => {
		expect(await iris('AW-UE150', { op: 's', set: 0x0 })).toEqual(['#AXI555'])
		expect(await iris('AW-UE150', { op: 's', set: 0xaaa })).toEqual(['#AXIFFF'])
	})

	it('steps from the position field the camera last reported', async () => {
		expect(await iris('AW-UE150', { op: 1, step: 0x1e }, { irisPosition: 0x100 })).toEqual(['#AXI673'])
	})

	it('offers the range the capability carries', () => {
		const set = getActionDefinitions(mockInstance('AW-UE150')).iris.options.find((f) => f.id === 'set')

		expect([set.min, set.max, set.default]).toEqual([0x0, 0xaaa, 0x555])
	})

	it.each(['AW-UB10', 'AW-UB50', 'AK-UB300', 'AK-UBX100'])('%s offers none', (model) => {
		expect(getActionDefinitions(mockInstance(model)).iris).toBeUndefined()
	})
})

// The AW-UB10/AW-UB50 answer QSL:25 with a value but refuse one: OSL:25 takes p*/m* steps only, which
// is why every absolute write came back ER3 (issue #97). The step count is decimal, not the hex notch
// count OSI:1E takes.
describe('gain on a camera that can only step it', () => {
	const gain = async (model, options) => {
		const self = mockInstance(model)
		await getActionDefinitions(self).gain.callback({ actionId: 'gain', options })
		return self.sent
	}

	it('sends one notch in either direction', async () => {
		expect(await gain('AW-UB10', { op: 1 })).toEqual(['OSL:25:p1'])
		expect(await gain('AW-UB10', { op: -1 })).toEqual(['OSL:25:m1'])
	})

	it('offers no value field to get refused with', () => {
		const options = getActionDefinitions(mockInstance('AW-UB10')).gain.options

		expect(options.map((field) => field.id)).toEqual(['op'])
	})

	it('still sets an absolute gain where the camera takes one', async () => {
		expect(await gain('AW-UE150', { op: 's', set: '08' })).toEqual(['OGU:08'])
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

// The camera stores exactly fifteen characters from a fixed alphabet and answers ER1 to anything else,
// so the action filters rather than forwards. Padding is wire format only — what the module keeps is
// the trimmed name, which is why parser.js trims the answer straight back off.
describe('preset names (AW-UE150A)', () => {
	async function name(options) {
		const self = mockInstance('AW-UE150A', { presetNames: [] })
		await getActionDefinitions(self).presetName.callback({ actionId: 'presetName', options })
		return self.sent
	}

	it('pads a short name out to the fixed fifteen characters', async () => {
		expect(await name({ op: 'set', val: 0, name: 'Wide' })).toEqual(['OSJ:35:00:Wide           '])
	})

	it('cuts a name the camera has no room for', async () => {
		expect(await name({ op: 'set', val: 11, name: 'Presenter close-up' })).toEqual(['OSJ:35:11:Presenter close'])
	})

	it('drops the characters the camera refuses', async () => {
		expect(await name({ op: 'set', val: 3, name: 'Gast: Müller!' })).toEqual(['OSJ:35:03:Gast Mller     '])
	})

	it('trims what the user typed before padding it', async () => {
		expect(await name({ op: 'set', val: 3, name: '  Wide  ' })).toEqual(['OSJ:35:03:Wide           '])
	})

	// OSJ:36 is the camera's own reset, putting Preset001-Preset100 back for the position. It is not a
	// delete, and storing a blank name is a different thing again - one the camera accepts as a name.
	it('resets to the default with the camera command rather than writing the name itself', async () => {
		expect(await name({ op: 'reset', val: 99, name: 'ignored' })).toEqual(['OSJ:36:99'])
	})

	// Guarded the same way as Preset - Clear All: the dropdown puts a whole-camera reset one click away
	// from the per-preset entries above it.
	it('resets every name at once, but only once confirmed', async () => {
		expect(await name({ op: 'resetAll', confirm: true })).toEqual(['OSJ:37'])
		expect(await name({ op: 'resetAll', confirm: false })).toEqual([])
	})

	// The checkbox is not on screen until the mode is picked, so an unticked one looks like a dead action.
	it('says why it did nothing when the confirmation is missing', async () => {
		const logged = []
		const self = mockInstance('AW-UE150A', { presetNames: [] })
		self.log = (level, message) => logged.push([level, message])

		await getActionDefinitions(self).presetName.callback({
			actionId: 'presetName',
			options: { op: 'resetAll', confirm: false },
		})

		expect(self.sent).toEqual([])
		expect(logged).toEqual([['warn', expect.stringContaining('confirmation')]])
	})

	it('needs no preset number to reset them all', async () => {
		expect(await name({ op: 'resetAll', val: 'nonsense', confirm: true })).toEqual(['OSJ:37'])
	})

	it('stores a name of nothing but spaces', async () => {
		expect(await name({ op: 'set', val: 4, name: '' })).toEqual(['OSJ:35:04:               '])
		expect(await name({ op: 'set', val: 4, name: '   ' })).toEqual(['OSJ:35:04:               '])
	})

	it('takes no action on a preset number it cannot read', async () => {
		expect(await name({ op: 'set', val: 'nonsense', name: 'Wide' })).toEqual([])
	})
})

// Wiping the presets wipes what was cached about them. The camera reports the empty slots back through
// pE soon enough, but on a model without a subscription that is a whole poll cycle of stale thumbnails.
describe('clearing every preset (AW-UE150A)', () => {
	// The cache is left to the entry report the camera pushes back: clearing it here would be guessing
	// ahead of a command that can still be refused, and there would then be no pE to put it right.
	it('leaves the cache to the camera rather than emptying it in advance', async () => {
		const self = mockInstance('AW-UE150A', {
			presetThumbnails: ['png', 'png'],
			presetNames: ['Wide', 'Tight'],
		})

		await getActionDefinitions(self).presetClearAll.callback({ actionId: 'presetClearAll', options: { confirm: true } })

		expect(self.sent).toHaveLength(100)
		expect(self.sent[0]).toBe('#C00')
		expect(self.data.presetThumbnails).toEqual(['png', 'png'])
		expect(self.data.presetNames).toEqual(['Wide', 'Tight'])
	})

	it('keeps them when the confirmation is not given, and says so', async () => {
		const logged = []
		const self = mockInstance('AW-UE150A', { presetNames: ['Wide'] })
		self.log = (level, message) => logged.push([level, message])

		await getActionDefinitions(self).presetClearAll.callback({
			actionId: 'presetClearAll',
			options: { confirm: false },
		})

		expect(self.sent).toEqual([])
		expect(self.data.presetNames).toEqual(['Wide'])
		expect(logged).toEqual([['warn', expect.stringContaining('confirmation')]])
	})
})

// A model without stored preset names must not offer the action at all; most of the range answers
// ER1 to OSJ:35, and the AW-UE20 does so despite having preset thumbnails.
describe('preset names on a model without them', () => {
	it.each(['AW-UE20', 'AW-UE4', 'AW-HE40'])('offers no name action for %s', (model) => {
		expect(getActionDefinitions(mockInstance(model)).presetName).toBeUndefined()
	})
})
