import { e } from './enum.js'
import { getAndUpdateSeries, getNext, getNextValue, constrainRange, toHexString } from './common.js'
import { Regex } from '@companion-module/base'

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

const speedSetting = {
	type: 'number',
	label: 'Speed setting',
	id: 'set',
	default: SPEED_DEFAULT,
	min: SPEED_MIN,
	max: SPEED_MAX,
	range: true,
	isVisibleExpression: '$(options:op) == "s"',
}

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

// A 'Set' plus some way of moving relative to the current value. The relative choices carry the
// same ids (+1 / -1) whatever they are called, so the wording is all that varies between the
// wrappers below.
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

// A numeric value that can be set outright or stepped, with either input optionally driven by a
// variable. The two wrappers below differ only in what the relative choices are called.
function optSetStepped(incLabel, decLabel, label, def, min, max, step) {
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
			isVisibleExpression: '$(options:op) == "s" && !$(options:useVar)',
		},
		{
			id: 'setVar',
			type: 'textinput',
			label: label + ' variable',
			default: `${def}`,
			regex: Regex.SOMETHING,
			useVariables: true,
			tooltip: `This expression should return digits in the range ${min} to ${max}. Numeric values outside this range will be constrained to this range. Invalid (unreadable) values will result in no action being taken.`,
			isVisibleExpression: '$(options:op) == "s" && $(options:useVar)',
		},
		{
			id: 'step',
			type: 'number',
			label: 'Step size',
			default: step,
			min: step,
			max: max - min,
			isVisibleExpression: '$(options:op) != "s" && !$(options:useVar)',
		},
		{
			id: 'stepVar',
			type: 'textinput',
			label: 'Step size variable',
			default: `${step}`,
			regex: Regex.SOMETHING,
			useVariables: true,
			tooltip: `This expression should return digits in the range ${step} to ${max - min}. Numeric values outside this range will be constrained to this range. Invalid (unreadable) values will result in no action being taken.`,
			isVisibleExpression: '$(options:op) != "s" && $(options:useVar)',
		},
		{
			id: 'useVar',
			disableAutoExpression: true,
			type: 'checkbox',
			label: 'Use Variable',
			default: false,
		},
	]
}

function optSetIncDecStep(label = 'Value', def, min, max, step = 1) {
	return optSetStepped('Increase', 'Decrease', label, def, min, max, step)
}

function optSetLowerRaise(label = 'Speed', def, min, max, step = 1) {
	return optSetStepped('Raise', 'Lower', label, def, min, max, step)
}

// ############################
// #### Command formatting ####
// ############################

// Resolves the variable-driven inputs onto the plain ones, so the command builders below only ever
// see numbers. Returns false when a variable does not currently read as a number, which aborts the
// action rather than sending a garbage value to the camera.
function parseSetIncDecVariables(action, min, max, step) {
	if (action.options.useVar) {
		if (action.options.op === ACTION_SET) {
			const setVar = constrainRange(parseInt(action.options.setVar), min, max)
			if (isNaN(setVar)) return false
			action.options.set = setVar
		} else {
			const stepVar = constrainRange(parseInt(action.options.stepVar), step, max - min)
			if (isNaN(stepVar)) return false
			action.options.step = stepVar
		}
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

function cmdSpeed(speed) {
	return speed.toString().padStart(2, '0')
}

// ##########################
// #### Instance Actions ####
// ##########################
export function getActionDefinitions(self) {
	const actions = {}

	const SERIES = getAndUpdateSeries(self)
	const caps = SERIES.capabilities

	const cam = (cmd) => self.getCam(cmd)
	const ptz = (cmd) => self.getPTZ(cmd)
	const web = (cmd) => self.getWeb(cmd)

	// ----- Action factories -----
	// `read` is a getter rather than a value: toggling and stepping are relative to whatever the
	// camera reports right now, which is not known when the definition is built.

	// A setting the camera exposes as a fixed list of values.
	const enumAction = (name, send, command, choices, read, { nextPrev = false, label } = {}) => ({
		name,
		options: nextPrev ? optSetToggleNextPrev(choices, label) : optSetToggle(choices, label),
		callback: async (action) => {
			await send(command + cmdEnum(action, choices, read()))
		},
	})

	// A bipolar level (pedestal, colour gain, chroma phase) centred on zero.
	const levelAction = (name, label, level, command, read) => ({
		name,
		options: optSetIncDecStep(label, 0, -level.limit, +level.limit, level.step),
		callback: async (action) => {
			if (!parseSetIncDecVariables(action, -level.limit, level.limit, level.step)) return
			const value = cmdValue(action, level.offset, -level.limit, level.limit, action.options.step, level.hexlen, read())
			await cam(`${command}:${value}`)
		},
	})

	// A one-shot command with nothing to configure.
	const simpleAction = (name, send, command) => ({
		name,
		options: [],
		callback: async () => {
			await send(command)
		},
	})

	// Recording and streaming are driven over HTTP with a word rather than a value.
	const webToggleAction = (name, url, read, { on = 'start', off = 'stop' } = {}) => ({
		name,
		options: optSetToggle(e.ENUM_OFF_ON),
		callback: async (action) => {
			const state = cmdEnum(action, e.ENUM_OFF_ON, read())
			await web(url + (state === '1' ? on : off))
		},
	})

	// Zoom and focus are the same three controls on different axes: a momentary move at the stored
	// speed, a direct speed command, and the stored speed itself.
	const lensAxis = (axis, command, speedProp, speedDataKey, incLabel, decLabel) => {
		const move = (dir) => ptz(command + cmdSpeed(dir * self[speedProp] + SPEED_OFFSET))
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
			control: {
				name: `Lens - ${axis} Speed Control`,
				options: [speedOperation, speedControlSetting, speedStep],
				callback: async (action) => {
					self.data[speedDataKey] =
						action.options.op !== ACTION_SET
							? getNextValue(self.data[speedDataKey], -SPEED_MAX, SPEED_MAX, action.options.op * action.options.step)
							: action.options.set
					await ptz(command + cmdSpeed(self.data[speedDataKey] + SPEED_OFFSET))
				},
			},
			speed: {
				name: `Lens - ${axis} Speed`,
				options: [speedOperation, speedSetting, speedStep],
				callback: async (action) => {
					self[speedProp] =
						action.options.op !== ACTION_SET
							? getNextValue(self[speedProp], SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
							: action.options.set
					self.setVariableValues({ [speedProp]: self[speedProp] })
					self.speedChangeEmitter.emit(speedProp)
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
					// Stop
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
				if (!parseSetIncDecVariables(action, SPEED_MIN, SPEED_MAX, 1)) return
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

	if (caps.zoom) {
		const zoom = lensAxis('Zoom', 'Z', 'zSpeed', 'zoomSpeedValue', '⬆ In', '⬇ Out')
		actions.zoom = zoom.move
		actions.zoomControl = zoom.control
		actions.zoomSpeed = zoom.speed
	}

	if (caps.focus) {
		const focus = lensAxis('Focus', 'F', 'fSpeed', 'focusSpeedValue', '⬆ Far', '⬇ Near')
		actions.focus = focus.move
		actions.focusControl = focus.control
		actions.focusSpeed = focus.speed

		actions.focusFollow = {
			name: 'Lens - Follow Focus',
			options: optSetIncDecStep('Focus setting', 0x555, 0x0, 0xaaa, 10),
			callback: async (action) => {
				if (!parseSetIncDecVariables(action, 0x0, 0xaaa, 10)) return
				await ptz('AXF' + cmdValue(action, 0x555, 0x0, 0xaaa, action.options.step, 3, self.data.focusPosition))
			},
		}
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

	if (caps.iris) {
		actions.iris = {
			name: 'Exposure - Iris',
			options: optSetIncDecStep('Iris setting', 0x555, 0x0, 0xaaa, 0x1e),
			callback: async (action) => {
				if (!parseSetIncDecVariables(action, 0x0, 0xaaa, 0x1e)) return
				await ptz('AXI' + cmdValue(action, 0x555, 0x0, 0xaaa, action.options.step, 3, self.data.irisPosition))
			},
		}
	}

	// special case for UB300
	if (caps.iris && SERIES.id === 'UB300') {
		actions.iris = {
			name: 'Exposure - Iris',
			options: optSetIncDecStep('Iris setting', 0x1ff, 0x0, 0x3ff, 0xa),
			callback: async (action) => {
				if (!parseSetIncDecVariables(action, 0x0, 0x3ff, 0xa)) return
				await cam('ORV:' + cmdValue(action, 0x0, 0x0, 0x3ff, action.options.step, 3, self.data.irisVolume))
			},
		}
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

	if (caps.gain.cmd) {
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
			'OSJ:0B',
			() => self.data.chromaPhaseValue,
		)
	}

	if (caps.dnr && caps.dnr.dropdown) {
		actions.dnr = enumAction(
			'Image - Digital Noise Reduction',
			cam,
			'OSD:3A:',
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

	// Red, blue and green pedestal and gain are the same control on six different channels.
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

	if (caps.colorTemperature && caps.colorTemperature.advanced && caps.colorTemperature.advanced.set) {
		const advanced = caps.colorTemperature.advanced
		actions.colorTemperature = {
			name: 'Image - Color Temperature',
			options: optSetIncDecStep('Color Temperature [K]', 3200, advanced.min, advanced.max, 20),
			callback: async (action) => {
				if (!parseSetIncDecVariables(action, advanced.min, advanced.max, 20)) return
				switch (action.options.op) {
					case ACTION_SET:
						await cam(advanced.set + ':' + toHexString(action.options.set, 5) + ':0')
						break
					case ACTION_INC:
						await cam(advanced.inc + ':1')
						break
					case ACTION_DEC:
						await cam(advanced.dec + ':1')
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
				{
					type: 'dropdown',
					label: 'Preset #',
					id: 'val',
					default: e.ENUM_PRESET[0].id,
					choices: e.ENUM_PRESET.slice(0, caps.preset),
					isVisibleExpression: '!$(options:useVar)',
				},
				{
					id: 'valVar',
					type: 'textinput',
					label: 'Preset # variable',
					default: '1',
					regex: Regex.SOMETHING,
					useVariables: true,
					tooltip: `This expression should return a preset number in the range 1 to ${caps.preset}. Numeric values outside this range will be constrained to this range. Invalid (unreadable) values will result in no action being taken.`,
					isVisibleExpression: '$(options:useVar)',
				},
				{
					id: 'useVar',
					disableAutoExpression: true,
					type: 'checkbox',
					label: 'Use Variable',
					default: false,
				},
			],
			callback: async (action) => {
				let val = action.options.val
				if (action.options.useVar) {
					const num = constrainRange(parseInt(action.options.valVar), 1, caps.preset)
					if (isNaN(num)) return
					val = (num - 1).toString(10).padStart(2, '0')
				}
				await ptz(action.options.op + val)
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

		actions.presetRecallScope = enumAction(
			'Preset - Recall Scope',
			cam,
			'OSE:71:',
			e.ENUM_PRESET_SCOPE,
			() => self.data.presetScope,
			{ nextPrev: true, label: 'Preset Recall Scope' },
		)

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
				if (!action.options.confirm) return
				for (let i = 0; i < caps.preset; i++) {
					await ptz('C' + i.toString(10).padStart(2, '0'))
				}
			},
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
				if (!parseSetIncDecVariables(action, audio.min, audio.max, audio.step)) return
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
			description:
				"To perform a remote restart of the camera the username and password for administrator authority are necessary. These are the same credentials that are used to log in to the camera's web interface. The factory default values are 'admin' and '12345'.",
			options: [
				{
					id: 'username',
					type: 'textinput',
					label: 'Username',
					default: 'admin',
					minLength: 1,
				},
				{
					id: 'password',
					type: 'textinput',
					label: 'Password',
					default: '12345',
					minLength: 1,
				},
			],
			callback: async (action) => {
				await self.getWeb('initial?cmd=reset&Randomnum=12345', action.options.username, action.options.password)
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
			// Use legacy PTZ Tally
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
			switch (action.options.dest) {
				case 0:
					await cam(action.options.cmd)
					break
				case 1:
					await ptz(action.options.cmd)
					break
				case 2:
					await web(action.options.cmd)
					break
			}
		},
	}

	return actions
}
