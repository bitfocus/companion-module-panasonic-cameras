import { e } from './enum.js'
import {
	seriesOf,
	getNext,
	getNextValue,
	constrainRange,
	toHexString,
	optPresetNumber,
	parsePresetNumber,
} from './common.js'

const PRESET_NAME_LENGTH = 15
const presetNameOnWire = (name) =>
	String(name ?? '')
		.trim()
		.replace(/[^A-Za-z0-9_ ]/g, '')
		.slice(0, PRESET_NAME_LENGTH)
		.padEnd(PRESET_NAME_LENGTH, ' ')

const SPEED_OFFSET = 50
const SPEED_MIN = 0
const SPEED_MAX = 49
const SPEED_DEFAULT = 25

const ACTION_SET = 's'
const ACTION_TOGGLE = 't'
const ACTION_STOP = 0
const ACTION_RAISE = 1
const ACTION_LOWER = -1
const ACTION_INC = 1
const ACTION_DEC = -1
const ACTION_NEXT = 1
const ACTION_PREV = -1

const liveSpeed = {
	id: 'liveSpeed',
	type: 'checkbox',
	label: 'Adjust the velocity on speed change',
	default: false,
}

const speedOperation = {
	type: 'dropdown',
	label: 'Speed Change',
	id: 'op',
	disableAutoExpression: true,
	default: ACTION_SET,
	choices: [
		{ id: ACTION_SET, label: 'Set Speed' },
		{ id: ACTION_RAISE, label: 'Raise Speed' },
		{ id: ACTION_LOWER, label: 'Lower Speed' },
	],
}

// The stored speed spans whatever the axis offers: a PTZ lens is nudged with a value the module folds
// into the jog command, a box camera's tempo is a setting of the camera's own with a range of its own.
const speedSetting = (min = SPEED_MIN, max = SPEED_MAX) => ({
	type: 'number',
	label: 'Speed setting',
	id: 'set',
	default: constrainRange(SPEED_DEFAULT, min, max),
	min,
	max,
	range: true,
	isVisibleExpression: '$(options:op) == "s"',
})

const speedControlSetting = {
	type: 'number',
	label: 'Direct speed setting',
	id: 'set',
	default: SPEED_MIN,
	min: -SPEED_MAX,
	max: SPEED_MAX,
	range: true,
	isVisibleExpression: '$(options:op) == "s"',
}

const speedStep = {
	id: 'step',
	type: 'number',
	label: 'Step size',
	default: 1,
	min: 1,
	max: 7,
	isVisibleExpression: '$(options:op) != "s"',
}

// #########################
// #### Option builders ####
// #########################

function optMove(label_inc = '⬆', label_dec = '⬇') {
	return [
		{
			type: 'dropdown',
			label: 'Direction',
			id: 'dir',
			default: ACTION_STOP,
			choices: [
				{ id: ACTION_STOP, label: 'Stop' },
				{ id: ACTION_INC, label: label_inc },
				{ id: ACTION_DEC, label: label_dec },
			],
		},
		liveSpeed,
	]
}

// 'Set' plus relative choices sharing ids (+1/-1); only the wording varies per wrapper.
function optSetChoice(relativeChoices, choices, label, def) {
	return [
		{
			type: 'dropdown',
			label: 'Action',
			id: 'op',
			disableAutoExpression: true,
			default: ACTION_SET,
			choices: [{ id: ACTION_SET, label: 'Set' }, ...relativeChoices],
		},
		{
			type: 'dropdown',
			label: label,
			id: 'set',
			default: choices[def].id,
			choices: choices,
			isVisibleExpression: '$(options:op) == "s"',
		},
	]
}

function optSetToggle(choices, label = 'Setting', def = 0) {
	return optSetChoice([{ id: ACTION_TOGGLE, label: 'Toggle' }], choices, label, def)
}

function optSetToggleNextPrev(choices, label = 'Setting', def = 0) {
	return optSetChoice(
		[
			{ id: ACTION_TOGGLE, label: 'Toggle' },
			{ id: ACTION_NEXT, label: 'Next' },
			{ id: ACTION_PREV, label: 'Previous' },
		],
		choices,
		label,
		def,
	)
}

// allowInvalidValues lets an out-of-range expression result through; resolveSetStep constrains it below.
// The step field normally shares the value's unit and range. A camera that steps in fixed notches
// (colour temperature: OSI:1E/OSI:1F take a count, not a Kelvin delta) passes its own via stepRange.
function optSetStepped(incLabel, decLabel, label, def, min, max, step, stepRange = {}) {
	const outOfRange = 'Values outside this range are constrained to it; an unreadable value takes no action.'
	const stepLabel = stepRange.label ?? 'Step size'
	const stepDef = stepRange.default ?? step
	const stepMin = stepRange.min ?? step
	const stepMax = stepRange.max ?? max - min

	return [
		{
			type: 'dropdown',
			label: 'Action',
			id: 'op',
			disableAutoExpression: true,
			default: ACTION_SET,
			choices: [
				{ id: ACTION_SET, label: 'Set' },
				{ id: ACTION_INC, label: incLabel },
				{ id: ACTION_DEC, label: decLabel },
			],
		},
		{
			id: 'set',
			type: 'number',
			label: label,
			default: def,
			min: min,
			max: max,
			step: step,
			range: true,
			asInteger: true,
			allowInvalidValues: true,
			expressionDescription: `This expression should return a number in the range ${min} to ${max}. ${outOfRange}`,
			isVisibleExpression: '$(options:op) == "s"',
		},
		{
			id: 'step',
			type: 'number',
			label: stepLabel,
			default: stepDef,
			min: stepMin,
			max: stepMax,
			asInteger: true,
			allowInvalidValues: true,
			expressionDescription: `This expression should return a number in the range ${stepMin} to ${stepMax}. ${outOfRange}`,
			isVisibleExpression: '$(options:op) != "s"',
		},
	]
}

function optSetIncDecStep(label = 'Value', def, min, max, step = 1, stepRange = {}) {
	return optSetStepped('Increase', 'Decrease', label, def, min, max, step, stepRange)
}

// Cameras that can only step (no absolute Set) get the relative options only.
function optIncDec() {
	return [
		{
			type: 'dropdown',
			label: 'Action',
			id: 'op',
			disableAutoExpression: true,
			default: ACTION_INC,
			choices: [
				{ id: ACTION_INC, label: 'Increase' },
				{ id: ACTION_DEC, label: 'Decrease' },
			],
		},
	]
}

function optSetLowerRaise(label = 'Speed', def, min, max, step = 1) {
	return optSetStepped('Raise', 'Lower', label, def, min, max, step)
}

// ############################
// #### Command formatting ####
// ############################

// Aborting sends no command. Silently, that is indistinguishable from a dead button — which is how
// the AK-UB300's Master Pedestal shipped: its capability carried no `step`, so the field's default
// and min were undefined and every Increase/Decrease returned here without a trace.
function abortSetStep(self, action, field) {
	self.log(
		'warn',
		`${action.actionId}: no command sent, "${field}" did not resolve to a number (${action.options[field]})`,
	)
	return false
}

// Constrains set/step into range; returns false on a non-numeric value to abort the action.
// stepRange must match the one the options were built with, or the field would offer values the
// callback then clamps away.
function resolveSetStep(self, action, min, max, step, stepRange = {}) {
	if (action.options.op === ACTION_SET) {
		const set = constrainRange(parseInt(action.options.set, 10), min, max)
		if (isNaN(set)) return abortSetStep(self, action, 'set')
		action.options.set = set
	} else {
		const size = constrainRange(parseInt(action.options.step, 10), stepRange.min ?? step, stepRange.max ?? max - min)
		if (isNaN(size)) return abortSetStep(self, action, 'step')
		action.options.step = size
	}
	return true
}

function cmdValue(action, offset, min, max, step, hexlen, data) {
	if (action.options.op === ACTION_SET) return toHexString(offset + action.options.set, hexlen)
	return toHexString(offset + getNextValue(data, min, max, action.options.op * step), hexlen)
}

function cmdEnum(action, dropdown, data) {
	if (action.options.op === ACTION_SET) return action.options.set
	if (action.options.op === ACTION_TOGGLE) return getNext(dropdown, data).id
	return getNext(dropdown, data, action.options.op, false).id
}

// Decimal, unlike the hex a position carries. Pan/tilt is two digits everywhere; a lens axis states
// its own width, because the box cameras' tempo is a single digit.
function cmdSpeed(speed, width = 2) {
	return speed.toString().padStart(width, '0')
}

// ##########################
// #### Instance Actions ####
// ##########################
export function getActionDefinitions(self) {
	const actions = {}

	const SERIES = seriesOf(self)
	const caps = SERIES.capabilities

	const cam = (cmd) => self.getCam(cmd)
	const ptz = (cmd) => self.getPTZ(cmd)
	const web = (cmd) => self.getWeb(cmd)

	// aw_ptz concatenates its argument, aw_cam separates it with a colon. A lens axis names its
	// transport, so it is the capability that decides which of the two a command goes out on.
	const sender = (transport) => {
		const go = transport === 'cam' ? cam : ptz
		const join = transport === 'cam' ? (cmd, value) => `${cmd}:${value}` : (cmd, value) => cmd + value

		// The direction commands (HZT, HFS) are the whole message; everything else carries a value.
		return (cmd, value) => go(value === undefined ? cmd : join(cmd, value))
	}

	// ----- Action factories -----
	// read is a getter: toggle/step are relative to the camera's current value, unknown at build time.
	const enumAction = (name, send, command, choices, read, { nextPrev = false, label } = {}) => ({
		name,
		options: nextPrev ? optSetToggleNextPrev(choices, label) : optSetToggle(choices, label),
		callback: async (action) => {
			await send(command + cmdEnum(action, choices, read()))
		},
	})

	// Bipolar level centred on zero.
	const levelAction = (name, label, level, command, read) => ({
		name,
		options: optSetIncDecStep(label, 0, -level.limit, +level.limit, level.step),
		callback: async (action) => {
			if (!resolveSetStep(self, action, -level.limit, level.limit, level.step)) return
			const value = cmdValue(action, level.offset, -level.limit, level.limit, action.options.step, level.hexlen, read())
			await cam(`${command}:${value}`)
		},
	})

	// Follow focus and iris are the same control: drive one axis to a value on its own scale. Bounds,
	// offset and width all come from the axis, so none of them is written out by hand.
	const positionAction = (name, label, cap, read) => {
		const send = sender(cap.transport)
		const { offset, max } = cap.range
		const { cmd, step, hexlen } = cap.position

		return {
			name,
			options: optSetIncDecStep(label, max >> 1, 0x0, max, step),
			callback: async (action) => {
				if (!resolveSetStep(self, action, 0x0, max, step)) return
				await send(cmd, cmdValue(action, offset, 0x0, max, action.options.step, hexlen, read()))
			},
		}
	}

	const simpleAction = (name, send, command) => ({
		name,
		options: [],
		callback: async () => {
			await send(command)
		},
	})

	// Recording/streaming go over HTTP with a word, not a value.
	const webToggleAction = (name, url, read, { on = 'start', off = 'stop' } = {}) => ({
		name,
		options: optSetToggle(e.ENUM_OFF_ON),
		callback: async (action) => {
			const state = cmdEnum(action, e.ENUM_OFF_ON, read())
			await web(url + (state === '1' ? on : off))
		},
	})

	// Zoom and focus share up to three controls per axis: momentary move, direct speed, stored speed.
	// Where the jog folds direction and magnitude into one command, that command serves both the move
	// (magnitude from the stored speed) and the direct speed. Where it only names a direction, the
	// tempo is a separate camera setting and there is no signed velocity to send, so no direct speed.
	const lensAxis = (cap, axis, speedProp, speedDataKey, incLabel, decLabel) => {
		const send = sender(cap.transport)
		const velocity = cap.jog.cmd !== undefined
		const storedMin = cap.speed ? cap.speed.min : SPEED_MIN
		const storedMax = cap.speed ? cap.speed.max : cap.jog.max - cap.jog.offset

		const drive = velocity
			? (speed) => send(cap.jog.cmd, cmdSpeed(speed + cap.jog.offset, cap.jog.width))
			: (speed) => send(speed === 0 ? cap.jog.stop : speed > 0 ? cap.jog.inc : cap.jog.dec)
		const move = (dir) => drive(dir * self[speedProp])
		return {
			move: {
				name: `Lens - ${axis}`,
				options: optMove(incLabel, decLabel),
				callback: async (action) => {
					await move(action.options.dir)

					if (self.speedChangeEmitter.listenerCount(speedProp)) {
						self.speedChangeEmitter.removeAllListeners(speedProp)
					}

					if (action.options.liveSpeed) {
						self.speedChangeEmitter.on(speedProp, async () => {
							await move(action.options.dir)
						})
					}
				},
			},
			control: velocity
				? {
						name: `Lens - ${axis} Speed Control`,
						options: [speedOperation, speedControlSetting, speedStep],
						callback: async (action) => {
							self.data[speedDataKey] =
								action.options.op !== ACTION_SET
									? getNextValue(
											self.data[speedDataKey],
											-SPEED_MAX,
											SPEED_MAX,
											action.options.op * action.options.step,
										)
									: action.options.set
							await drive(self.data[speedDataKey])
						},
					}
				: undefined,
			speed: {
				name: `Lens - ${axis} Speed`,
				options: [speedOperation, speedSetting(storedMin, storedMax), speedStep],
				callback: async (action) => {
					self[speedProp] = constrainRange(
						action.options.op !== ACTION_SET
							? getNextValue(self[speedProp], storedMin, storedMax, action.options.op * action.options.step)
							: action.options.set,
						storedMin,
						storedMax,
					)
					self.setVariableValues({ [speedProp]: self[speedProp] })
					self.speedChangeEmitter.emit(speedProp)

					// Where the tempo is the camera's own setting it has to be told; the jog carries it otherwise.
					if (cap.speed) await send(cap.speed.cmd, cmdSpeed(self[speedProp], cap.speed.width))
				},
			},
		}
	}

	// ##########################
	// #### Pan/Tilt Actions ####
	// ##########################

	if (caps.panTilt) {
		actions.ptMove = {
			name: 'Pan/Tilt - Move',
			options: [
				{
					type: 'dropdown',
					label: 'Direction',
					id: 'dir',
					default: '11',
					choices: [
						{ id: '11', label: 'Stop' },
						{ id: '21', label: '➡ Right' }, // +
						{ id: '01', label: '⬅ Left' }, // -
						{ id: '12', label: '⬆ Up' }, // +
						{ id: '10', label: '⬇ Down' }, // -
						{ id: '22', label: '⬈ Up Right' }, // ++
						{ id: '02', label: '⬉ Up Left' }, // -+
						{ id: '00', label: '⬋ Down Left' }, // --
						{ id: '20', label: '⬊ Down Right' }, // +-
					],
				},
				liveSpeed,
			],
			callback: async (action) => {
				if (action.options.dir === '11') {
					await self.getPTZ('PTS' + cmdSpeed(SPEED_OFFSET) + cmdSpeed(SPEED_OFFSET))
					if (self.speedChangeEmitter.listenerCount('ptSpeed')) self.speedChangeEmitter.removeAllListeners('ptSpeed')
				} else {
					let arr = Array.from(action.options.dir)
					let pan = parseInt(arr[0]) - 1
					let tilt = parseInt(arr[1]) - 1
					await self.getPTZ(
						'PTS' + cmdSpeed(pan * self.pSpeed + SPEED_OFFSET) + cmdSpeed(tilt * self.tSpeed + SPEED_OFFSET),
					)
					if (action.options.liveSpeed) {
						self.speedChangeEmitter.removeAllListeners('ptSpeed').then(
							self.speedChangeEmitter.on('ptSpeed', async () => {
								await self.getPTZ(
									'PTS' + cmdSpeed(pan * self.pSpeed + SPEED_OFFSET) + cmdSpeed(tilt * self.tSpeed + SPEED_OFFSET),
								)
							}),
						)
					}
				}
			},
		}

		actions.home = simpleAction('Pan/Tilt - Home Position', ptz, 'APC80008000')

		if (caps.panTiltLimit) {
			actions.ptLimit = {
				name: 'Pan/Tilt - Movement Range Limit',
				description:
					'Switches the movement range limit for one direction. Each direction is independent, and the camera reports every change back.',
				options: [
					{
						type: 'dropdown',
						label: 'Direction',
						id: 'dir',
						default: e.ENUM_PT_LIMIT[0].id,
						choices: e.ENUM_PT_LIMIT,
					},
					...optSetToggle(e.ENUM_OFF_ON, 'Limit', 0),
				],
				callback: async (action) => {
					const current = self.data.panTiltLimits[parseInt(action.options.dir, 10) - 1]
					await ptz('LC' + action.options.dir + cmdEnum(action, e.ENUM_OFF_ON, current))
				},
			}
		}

		actions.ptSpeed = {
			name: 'Pan/Tilt - Speed',
			options: [
				{
					type: 'dropdown',
					label: 'Scope',
					id: 'scope',
					default: 'pt',
					choices: [
						{ id: 'pt', label: 'Pan + Tilt' },
						{ id: 'p', label: 'Pan' },
						{ id: 't', label: 'Tilt' },
					],
				},
				...optSetLowerRaise('Speed', SPEED_DEFAULT, SPEED_MIN, SPEED_MAX, 1),
			],
			callback: async (action) => {
				if (!resolveSetStep(self, action, SPEED_MIN, SPEED_MAX, 1)) return
				switch (action.options.scope) {
					case 'pt':
						self.ptSpeed =
							action.options.op === ACTION_SET
								? action.options.set
								: getNextValue(self.ptSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
						self.pSpeed = self.ptSpeed
						self.tSpeed = self.ptSpeed
						break
					case 'p':
						self.pSpeed =
							action.options.op === ACTION_SET
								? action.options.set
								: getNextValue(self.pSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
						break
					case 't':
						self.tSpeed =
							action.options.op === ACTION_SET
								? action.options.set
								: getNextValue(self.tSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
						break
				}
				if (self.pSpeed === self.tSpeed) self.ptSpeed = self.pSpeed
				self.setVariableValues({
					ptSpeed: self.ptSpeed,
					pSpeed: self.pSpeed,
					tSpeed: self.tSpeed,
				})
				self.speedChangeEmitter.emit('ptSpeed')
			},
		}
	}

	// ######################
	// #### Lens Actions ####
	// ######################

	if (caps.zoom?.jog) {
		const zoom = lensAxis(caps.zoom, 'Zoom', 'zSpeed', 'zoomSpeedValue', '⬆ In', '⬇ Out')
		actions.zoom = zoom.move
		if (zoom.control) actions.zoomControl = zoom.control
		actions.zoomSpeed = zoom.speed
	}

	if (caps.focus?.jog) {
		const focus = lensAxis(caps.focus, 'Focus', 'fSpeed', 'focusSpeedValue', '⬆ Far', '⬇ Near')
		actions.focus = focus.move
		if (focus.control) actions.focusControl = focus.control
		actions.focusSpeed = focus.speed
	}

	if (caps.focus?.position) {
		actions.focusFollow = positionAction(
			'Lens - Follow Focus',
			'Focus setting',
			caps.focus,
			() => self.data.focusPosition,
		)
	}

	if (caps.focusAuto) {
		actions.focusMode = enumAction('Lens - Focus Mode', cam, 'OAF:', e.ENUM_MAN_AUTO, () => self.data.focusMode)
	}

	if (caps.focusPushAuto) {
		actions.focusPushAuto = simpleAction('Lens - Focus Push Auto', cam, 'OSE:69:1')
	}

	if (caps.ois) {
		actions.ois = enumAction('Lens - Image Stabilization Mode', cam, 'OIS:', caps.ois.dropdown, () => self.data.ois, {
			nextPrev: true,
		})
	}

	// ##########################
	// #### Exposure Actions ####
	// ##########################

	// An axis can report a position without being drivable to one, so the command decides, not the axis.
	if (caps.iris?.position) {
		actions.iris = positionAction('Exposure - Iris', 'Iris setting', caps.iris, () => self.data.irisPosition)
	}

	if (caps.irisAuto) {
		actions.irisMode = enumAction('Exposure - Iris Mode', cam, 'ORS:', e.ENUM_MAN_AUTO, () => self.data.irisMode)
	}

	if (caps.filter) {
		actions.filter = enumAction('Exposure - ND Filter', cam, 'OFT:', caps.filter.dropdown, () => self.data.filter, {
			nextPrev: true,
		})
	}

	if (caps.shutter) {
		actions.shutter = enumAction(
			'Exposure - Shutter',
			cam,
			caps.shutter.cmd + ':',
			caps.shutter.dropdown,
			() => self.data.shutter,
			{ nextPrev: true },
		)

		if (caps.shutter.inc && caps.shutter.dec) {
			actions.shutterStepUp = simpleAction('Exposure - Shutter Step Up', cam, caps.shutter.inc + ':01')
			actions.shutterStepDown = simpleAction('Exposure - Shutter Step Down', cam, caps.shutter.dec + ':01')
		}
	}

	if (caps.night) {
		actions.nightMode = enumAction('Exposure - Night Mode', ptz, 'D6', e.ENUM_OFF_ON, () => self.data.nightMode)
	}

	// #######################
	// #### Image Actions ####
	// #######################

	if (caps.gain.inc) {
		actions.gain = {
			name: 'Image - Gain',
			options: optIncDec(),
			callback: async (action) => {
				await cam((action.options.op === ACTION_INC ? caps.gain.inc : caps.gain.dec) + '1')
			},
		}
	} else if (caps.gain.cmd) {
		actions.gain = enumAction('Image - Gain', cam, caps.gain.cmd + ':', caps.gain.dropdown, () => self.data.gain, {
			nextPrev: true,
		})
	}

	if (caps.chromaLevel && caps.chromaLevel.cmd) {
		actions.chromaLevel = enumAction(
			'Image - Chroma Level',
			cam,
			caps.chromaLevel.cmd + ':',
			caps.chromaLevel.dropdown,
			() => self.data.chromaLevel,
			{ nextPrev: true },
		)
	}

	if (caps.chromaPhase) {
		actions.chromaPhase = levelAction(
			'Image - Chroma Phase',
			'Setting',
			caps.chromaPhase,
			caps.chromaPhase.cmd,
			() => self.data.chromaPhaseValue,
		)
	}

	if (caps.dnr && caps.dnr.dropdown) {
		actions.dnr = enumAction(
			'Image - Digital Noise Reduction',
			cam,
			caps.dnr.cmd + ':',
			caps.dnr.dropdown,
			() => self.data.dnr,
			{ nextPrev: true },
		)
	}

	if (caps.drs && caps.drs.dropdown) {
		actions.drs = enumAction('Image - Dynamic Range Stretch', cam, 'OSE:33:', caps.drs.dropdown, () => self.data.drs, {
			nextPrev: true,
		})
	}

	if (caps.pedestal.cmd) {
		actions.ped = levelAction(
			'Image - Pedestal',
			'Level',
			caps.pedestal,
			caps.pedestal.cmd,
			() => self.data.masterPedValue,
		)
	}

	// Same pedestal/gain control across the colour channels.
	const COLOR_CHANNELS = [
		{ suffix: 'Red', channel: 'red' },
		{ suffix: 'Blue', channel: 'blue' },
		{ suffix: 'Green', channel: 'green' },
	]

	for (const { suffix, channel } of COLOR_CHANNELS) {
		if (caps.colorPedestal && caps.colorPedestal.cmd[channel]) {
			actions[`ped${suffix}`] = levelAction(
				`Image - ${suffix} Pedestal`,
				'Level',
				caps.colorPedestal,
				caps.colorPedestal.cmd[channel],
				() => self.data[`${channel}PedValue`],
			)
		}

		if (caps.colorGain && caps.colorGain.cmd[channel]) {
			actions[`gain${suffix}`] = levelAction(
				`Image - ${suffix} Gain`,
				'Level',
				caps.colorGain,
				caps.colorGain.cmd[channel],
				() => self.data[`${channel}GainValue`],
			)
		}
	}

	if (caps.whiteBalance) {
		if (caps.whiteBalance.dropdown) {
			actions.whiteBalanceMode = enumAction(
				'Image - White Balance Mode',
				cam,
				'OAW:',
				caps.whiteBalance.dropdown,
				() => self.data.whiteBalance,
				{ nextPrev: true },
			)
		}

		actions.whiteBalanceExecAWB = simpleAction('Image - Execute AWC/AWB', cam, 'OWS')
	}

	if (caps.blackBalance) {
		actions.whiteBalanceExecABB = simpleAction('Image - Execute ABC/ABB', cam, 'OAS')
	}

	if (caps.colorTemperature && caps.colorTemperature.index) {
		actions.colorTemperature = enumAction(
			'Image - Color Temperature',
			cam,
			caps.colorTemperature.index.cmd + ':',
			caps.colorTemperature.index.dropdown,
			() => self.data.colorTemperature,
			{ nextPrev: true },
		)
	}

	// UB300 can only step colour temperature, not set it.
	if (caps.colorTemperature && caps.colorTemperature.advanced) {
		const advanced = caps.colorTemperature.advanced
		// OSI:1E/OSI:1F take a count of the camera's own notches (1h-Ah), so the step field is measured
		// in notches while `set` stays in Kelvin.
		const stepRange = { label: 'Steps', default: 1, min: 1, max: advanced.maxStep }

		actions.colorTemperature = {
			name: 'Image - Color Temperature',
			options: advanced.set
				? optSetIncDecStep('Color Temperature [K]', 3200, advanced.min, advanced.max, 20, stepRange)
				: optIncDec(),
			callback: async (action) => {
				if (advanced.set && !resolveSetStep(self, action, advanced.min, advanced.max, 20, stepRange)) return

				// Without `set` there is no step field (UB300), and that camera takes one notch anyway.
				const notches = advanced.set ? toHexString(action.options.step, 1) : '1'

				switch (action.options.op) {
					case ACTION_SET:
						await cam(advanced.set + ':' + toHexString(action.options.set, 5) + ':0')
						break
					case ACTION_INC:
						await cam(`${advanced.inc}:${notches}`)
						break
					case ACTION_DEC:
						await cam(`${advanced.dec}:${notches}`)
						break
				}
			},
		}
	}

	if (caps.shootingMode) {
		actions.shootingMode = enumAction(
			'Image - Shooting Mode',
			cam,
			caps.shootingMode.cmd + ':',
			caps.shootingMode.dropdown,
			() => self.data.shootingMode,
			{ nextPrev: true },
		)
	}

	// ########################
	// #### Preset Actions ####
	// ########################

	if (caps.preset) {
		actions.presetMem = {
			name: 'Preset - Memory Operation',
			options: [
				{
					type: 'dropdown',
					label: 'Action',
					id: 'op',
					disableAutoExpression: true,
					default: 'R',
					choices: [
						{ id: 'R', label: 'Recall / Play' },
						{ id: 'M', label: 'Memorize / Save' },
						{ id: 'C', label: 'Clear / Delete' },
					],
				},
				optPresetNumber('val', caps.preset),
			],
			callback: async (action) => {
				const idx = parsePresetNumber(action.options.val, caps.preset)
				if (idx === null) return
				await ptz(action.options.op + idx.toString(10).padStart(2, '0'))
			},
		}

		actions.presetResetSelectedCompletedState = {
			name: 'Preset - Reset Selected / Completed State',
			options: [],
			callback: async () => {
				self.data.presetSelectedIdx = null
				self.data.presetCompletedIdx = null
				self.checkVariables()
				self.checkAllFeedbacks()
			},
		}

		if (caps.presetScope) {
			actions.presetRecallScope = enumAction(
				'Preset - Recall Scope',
				cam,
				'OSE:71:',
				e.ENUM_PRESET_SCOPE,
				() => self.data.presetScope,
				{ nextPrev: true, label: 'Preset Recall Scope' },
			)
		}

		actions.presetClearAll = {
			name: 'Preset - Clear All',
			description: `Wipes all ${caps.preset} stored preset memories on the camera. This cannot be undone. Requires the confirmation option to be checked to take effect.`,
			options: [
				{
					id: 'confirm',
					type: 'checkbox',
					label: 'I understand this will instantly clear all presets',
					default: false,
				},
			],
			callback: async (action) => {
				if (!action.options.confirm) {
					return self.log('warn', ' Clear All Preset Memories skipped, its confirmation option is not checked')
				}
				for (let i = 0; i < caps.preset; i++) {
					await ptz('C' + i.toString(10).padStart(2, '0'))
				}
			},
		}

		if (caps.presetNames) {
			actions.presetName = {
				name: 'Preset - Name',
				options: [
					{
						type: 'dropdown',
						label: 'Action',
						id: 'op',
						disableAutoExpression: true,
						default: 'set',
						choices: [
							{ id: 'set', label: 'Set' },
							{ id: 'reset', label: 'Reset to Default' },
							{ id: 'resetAll', label: 'Reset All to Default' },
						],
					},
					{ ...optPresetNumber('val', caps.preset), isVisibleExpression: '$(options:op) != "resetAll"' },
					{
						id: 'name',
						type: 'textinput',
						label: 'Name',
						default: '',
						isVisibleExpression: '$(options:op) == "set"',
					},
					{
						id: 'confirm',
						type: 'checkbox',
						label: 'I understand this will instantly reset all preset names',
						default: false,
						isVisibleExpression: '$(options:op) == "resetAll"',
					},
				],
				callback: async (action) => {
					if (action.options.op === 'resetAll') {
						if (!action.options.confirm) {
							return self.log('warn', 'Reset All Preset Names skipped, its confirmation option is not checked')
						}
						await cam('OSJ:37')
						return
					}

					const idx = parsePresetNumber(action.options.val, caps.preset)
					if (idx === null) return
					const n = idx.toString(10).padStart(2, '0')

					if (action.options.op === 'reset') await cam('OSJ:36:' + n)
					else await cam(`OSJ:35:${n}:${presetNameOnWire(action.options.name)}`)
				},
			}
		}
	}

	if (caps.presetSpeed) {
		const velocity = caps.presetTime ? e.ENUM_PRESET_SPEED_TIME : e.ENUM_PRESET_SPEED
		actions.presetSpeedTime = {
			name: 'Preset - Recall Velocity',
			options: optSetToggleNextPrev(velocity, 'Speed / Time'),
			callback: async (action) => {
				const v = cmdEnum(action, velocity, self.data.presetSpeed)
				const r = parseInt(v, 16)
				const s = r < 0x001 || r > 0x063
				if (caps.presetTime) await cam('OSJ:29:' + (s ? '0' : '1'))
				await ptz('UPVS' + v)
			},
		}

		actions.presetSpeedTable = enumAction(
			'Preset - Recall Speed Table',
			ptz,
			'PST',
			caps.presetSpeed.dropdown,
			() => self.data.presetSpeedTable,
			{ nextPrev: true },
		)
	}

	if (caps.presetTime) {
		actions.presetSpeedTimeUnit = enumAction(
			'Preset - Recall Velocity Unit',
			cam,
			'OSJ:29:',
			e.ENUM_PRESET_SPEED_UNIT,
			() => self.data.presetSpeedUnit,
			{ nextPrev: true },
		)

		actions.presetTime = {
			name: 'Preset - Recall Time',
			options: [
				{
					id: 'val',
					type: 'number',
					label: 'Time Seconds',
					default: 1,
					min: 1,
					max: 99,
					range: true,
				},
			],
			callback: async (action) => {
				await cam('OSJ:29:1')
				await ptz('UPVS' + toHexString(action.options.val, 3))
			},
		}
	}

	// ##############################
	// #### Autotracking Actions ####
	// ##############################

	if (caps.trackingAuto) {
		actions.autotrackingMode = enumAction(
			'Auto Tracking - Mode',
			cam,
			'OSL:B6:',
			e.ENUM_OFF_ON,
			() => self.data.autotrackingMode,
		)

		actions.autotrackingAngle = enumAction(
			'Auto Tracking - Angle',
			cam,
			'OSL:B7:',
			e.ENUM_AUTOTRACKING_ANGLE,
			() => self.data.autotrackingAngle,
		)

		actions.autotrackingStartStop = enumAction(
			'Auto Tracking - Start/Stop Tracking',
			cam,
			'OSL:BC:',
			e.ENUM_STOP_START,
			() => self.data.autotrackingEnabled,
		)
	}

	// #######################
	// #### Audio Actions ####
	// #######################

	if (caps.audioVolumeLevel) {
		const audio = caps.audioVolumeLevel
		actions.audioVolumeLevel = {
			name: 'Audio - Volume Level',
			options: [
				{
					type: 'dropdown',
					label: 'Audio Channel',
					id: 'channel',
					default: 0,
					choices: Array.from({ length: audio.maxch }, (_, i) => ({ id: i, label: `Ch ${i + 1}` })),
				},
				...optSetIncDecStep('Volume Level (dB)', 0, audio.min, audio.max, audio.step),
			],
			callback: async (action) => {
				if (!resolveSetStep(self, action, audio.min, audio.max, audio.step)) return
				const value = cmdValue(
					action,
					0x80,
					audio.min,
					audio.max,
					action.options.step,
					2,
					self.data.audioVolumeLevels[action.options.channel] ?? 0,
				)
				await cam(`OSA:D5:${action.options.channel}:${value}`)
			},
		}
	}

	// ########################
	// #### System Actions ####
	// ########################

	if (caps.power) {
		actions.power = enumAction('System - Power', ptz, 'O', e.ENUM_OFF_ON, () => self.data.power)
	}

	if (caps.restart) {
		actions.restart = {
			name: 'System - Restart',
			description: 'Restarts the camera. Requires valid credentials with administrator privileges.',
			options: [],
			callback: async () => {
				await self.getWeb('initial?cmd=reset&Randomnum=12345')
			},
		}
	}

	if (caps.tally) {
		if (caps.tally2) {
			actions.tally = enumAction('System - Red Tally', cam, 'TLR:', e.ENUM_OFF_ON, () => self.data.tally)
			actions.tally2 = enumAction('System - Green Tally', cam, 'TLG:', e.ENUM_OFF_ON, () => self.data.tally2)

			if (caps.tally3) {
				actions.tally3 = enumAction('System - Yellow Tally', cam, 'TLY:', e.ENUM_OFF_ON, () => self.data.tally3)
			}
		} else {
			// Legacy PTZ tally.
			actions.tally = enumAction('System - Tally', ptz, 'DA', e.ENUM_OFF_ON, () => self.data.tally)
		}
	}

	if (caps.colorbar) {
		actions.colorbar = enumAction('System - Color Bar', cam, 'DCB:', e.ENUM_OFF_ON, () => self.data.colorbar)
	}

	if (caps.install) {
		actions.installPosition = enumAction(
			'System - Installation Position',
			ptz,
			'INS',
			e.ENUM_INSTALL_POSITION,
			() => self.data.installMode,
		)
	}

	if (caps.recordSD) {
		actions.sdCardRec = webToggleAction(
			'System - SD Card Recording Control',
			'sdctrl?save=',
			() => self.data.recording,
			{ off: 'end' },
		)
	}

	if (caps.streamSRT) {
		actions.srtStreamCtrl = webToggleAction('Streaming - SRT Caller Control', 'srt_ctrl?cmd=', () => self.data.srt)
	}

	if (caps.streamTS) {
		actions.tsStreamCtrl = webToggleAction('Streaming - MPEG-TS Output Control', 'ts_ctrl?cmd=', () => self.data.ts)
	}

	if (caps.streamRTMP) {
		actions.rtmpStreamCtrl = webToggleAction('Streaming - RTMP Push Control', 'rtmp_ctrl?cmd=', () => self.data.rtmp)
	}

	actions.customCommand = {
		name: 'Custom Command',
		description:
			'Sends a custom command to the camera. This enables operations that are not (yet) covered by this module. Please read the public protocol specifications for details!',
		options: [
			{
				type: 'dropdown',
				label: 'Target',
				id: 'dest',
				default: 0,
				choices: [
					{ id: 0, label: 'Cam' },
					{ id: 1, label: 'PTZ' },
					{ id: 2, label: 'Web' },
				],
			},
			{
				id: 'cmd',
				type: 'textinput',
				label: 'Command (without leading # for PTZ commands)',
				default: '',
			},
		],
		callback: async (action) => {
			const send = { 0: cam, 1: ptz, 2: web }[action.options.dest]
			if (!send) return

			// The variable is the answer to the command sent last, so a slow earlier request must not
			// land on top of a faster later one. Requests are not serialised - two buttons may well be
			// meant to fire at once - only the writing of the answer is.
			const sequence = (self.customCommandSequence = (self.customCommandSequence ?? 0) + 1)
			const response = (await send(action.options.cmd)) ?? null
			if (sequence !== self.customCommandSequence) return

			self.data.customResponse = response
			self.checkVariables()
		},
	}

	return actions
}
