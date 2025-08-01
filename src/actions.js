/* eslint-disable no-unused-vars */
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
const ACTION_HOLD = 0
const ACTION_RAISE = 1
const ACTION_LOWER = -1
const ACTION_UP = 1
const ACTION_DOWN = -1
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
	required: true,
	range: true,
	isVisible: (options) => options.op === 's',
}

const speedControlSetting = {
	type: 'number',
	label: 'Direct speed setting',
	id: 'set',
	default: SPEED_MIN,
	min: -SPEED_MAX,
	max: SPEED_MAX,
	required: true,
	range: true,
	isVisible: (options) => options.op === 's',
}

const speedStep = {
	id: 'step',
	type: 'number',
	label: 'Step size',
	default: 1,
	min: 1,
	max: 7,
	required: false,
	isVisible: (options) => options.op !== 's',
}

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

function optSetToggle(choices, label = 'Setting', def = 0) {
	return [
		{
			type: 'dropdown',
			label: 'Action',
			id: 'op',
			default: ACTION_SET,
			choices: [
				{ id: ACTION_SET, label: 'Set' },
				{ id: ACTION_TOGGLE, label: 'Toggle' },
			],
		},
		{
			type: 'dropdown',
			label: label,
			id: 'set',
			default: choices[def].id,
			choices: choices,
			isVisible: (options) => options.op === 's',
		},
	]
}

function optSetToggleNextPrev(choices, label = 'Setting', def = 0) {
	return [
		{
			type: 'dropdown',
			label: 'Action',
			id: 'op',
			default: ACTION_SET,
			choices: [
				{ id: ACTION_SET, label: 'Set' },
				{ id: ACTION_TOGGLE, label: 'Toggle' },
				{ id: ACTION_NEXT, label: 'Next' },
				{ id: ACTION_PREV, label: 'Previous' },
			],
		},
		{
			type: 'dropdown',
			label: label,
			id: 'set',
			default: choices[def].id,
			choices: choices,
			isVisible: (options) => options.op === 's',
		},
	]
}

function optSetIncDecStep(label = 'Value', def, min, max, step = 1) {
	return [
		{
			type: 'dropdown',
			label: 'Action',
			id: 'op',
			default: ACTION_SET,
			choices: [
				{ id: ACTION_SET, label: 'Set' },
				{ id: ACTION_INC, label: 'Increase' },
				{ id: ACTION_DEC, label: 'Decrease' },
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
			required: true,
			range: true,
			isVisible: (options) => options.op === 's' && !options.useVar,
		},
		{
			id: 'setVar',
			type: 'textinput',
			label: label + ' variable',
			default: `${def}`,
			regex: Regex.SOMETHING,
			required: true,
			useVariables: true,
			tooltip: `This expression should return digits in the range ${min} to ${max}. Numeric values outside this range will be constrained to this range. Invalid (unreadable) values will result in no action being taken.`,
			isVisible: (options) => options.op === 's' && options.useVar,
		},
		{
			id: 'step',
			type: 'number',
			label: 'Step size',
			default: step,
			min: step,
			max: max - min,
			required: true,
			isVisible: (options) => options.op !== 's' && !options.useVar,
		},
		{
			id: 'stepVar',
			type: 'textinput',
			label: 'Step size variable',
			default: `${step}`,
			regex: Regex.SOMETHING,
			required: true,
			useVariables: true,
			tooltip: `This expression should return digits in the range ${step} to ${max - min}. Numeric values outside this range will be constrained to this range. Invalid (unreadable) values will result in no action being taken.`,
			isVisible: (options) => options.op !== 's' && options.useVar,
		},
		{
			id: 'useVar',
			type: 'checkbox',
			label: 'Use Variable',
			default: false,
		},
	]
}

async function parseSetIncDecVariables(action, self, min, max, step) {
	if (action.options.useVar) {
		if (action.options.op === ACTION_SET) {
			const setVar = constrainRange(parseInt(await self.parseVariablesInString(action.options.setVar)), min, max)
			if (isNaN(setVar)) return false
			action.options.set = setVar
		} else {
			const stepVar = constrainRange(parseInt(await self.parseVariablesInString(action.options.stepVar)), step, max - min)
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

	// ##########################
	// #### Pan/Tilt Actions ####
	// ##########################

	if (SERIES.capabilities.panTilt) {
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
					await self.getPTZ('PTS' + cmdSpeed(pan * self.pSpeed + SPEED_OFFSET) + cmdSpeed(tilt * self.tSpeed + SPEED_OFFSET))
					if (action.options.liveSpeed) {
						self.speedChangeEmitter.removeAllListeners('ptSpeed').then(
							self.speedChangeEmitter.on('ptSpeed', async () => {
								await self.getPTZ('PTS' + cmdSpeed(pan * self.pSpeed + SPEED_OFFSET) + cmdSpeed(tilt * self.tSpeed + SPEED_OFFSET))
							}),
						)
					}
				}
			},
		}

		actions.home = {
			name: 'Pan/Tilt - Home Position',
			options: [],
			callback: async (action) => {
				await self.getPTZ('APC80008000')
			},
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
				speedOperation,
				speedSetting,
				speedStep,
			],
			callback: async (action) => {
				switch (action.options.scope) {
					case 'pt':
						self.ptSpeed = action.options.op === ACTION_SET ? action.options.set : getNextValue(self.ptSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
						self.pSpeed = self.ptSpeed
						self.tSpeed = self.ptSpeed
						break
					case 'p':
						self.pSpeed = action.options.op === ACTION_SET ? action.options.set : getNextValue(self.pSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
						break
					case 't':
						self.tSpeed = action.options.op === ACTION_SET ? action.options.set : getNextValue(self.tSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step)
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

	if (SERIES.capabilities.zoom) {
		actions.zoom = {
			name: 'Lens - Zoom',
			options: optMove('⬆ In', '⬇ Out'),
			callback: async (action) => {
				await self.getPTZ('Z' + cmdSpeed(action.options.dir * self.zSpeed + SPEED_OFFSET))

				if (self.speedChangeEmitter.listenerCount('zSpeed')) self.speedChangeEmitter.removeAllListeners('zSpeed')

				if (action.options.liveSpeed) {
					self.speedChangeEmitter.on('zSpeed', async () => {
						await self.getPTZ('Z' + cmdSpeed(action.options.dir * self.zSpeed + SPEED_OFFSET))
					})
				}
			},
		}

		actions.zoomControl = {
			name: 'Lens - Zoom Speed Control',
			options: [speedOperation, speedControlSetting, speedStep],
			callback: async (action) => {
				self.data.zoomSpeedValue = action.options.op !== ACTION_SET ? getNextValue(self.data.zoomSpeedValue, -SPEED_MAX, SPEED_MAX, action.options.op * action.options.step) : action.options.set
				await self.getPTZ('Z' + cmdSpeed(self.data.zoomSpeedValue + SPEED_OFFSET))
			},
		}

		actions.zoomSpeed = {
			name: 'Lens - Zoom Speed',
			options: [speedOperation, speedSetting, speedStep],
			callback: async (action) => {
				self.zSpeed = action.options.op !== ACTION_SET ? getNextValue(self.zSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step) : action.options.set
				self.setVariableValues({ zSpeed: self.zSpeed })
				self.speedChangeEmitter.emit('zSpeed')
			},
		}
	}

	if (SERIES.capabilities.focus) {
		actions.focus = {
			name: 'Lens - Focus',
			options: optMove('⬆ Far', '⬇ Near'),
			callback: async (action) => {
				await self.getPTZ('F' + cmdSpeed(action.options.dir * self.fSpeed + SPEED_OFFSET))

				if (self.speedChangeEmitter.listenerCount('fSpeed')) self.speedChangeEmitter.removeAllListeners('fSpeed')

				if (action.options.liveSpeed) {
					self.speedChangeEmitter.on('fSpeed', async () => {
						await self.getPTZ('F' + cmdSpeed(action.options.dir * self.fSpeed + SPEED_OFFSET))
					})
				}
			},
		}

		actions.focusControl = {
			name: 'Lens - Focus Speed Control',
			options: [speedOperation, speedControlSetting, speedStep],
			callback: async (action) => {
				self.data.focusSpeedValue = action.options.op !== ACTION_SET ? getNextValue(self.data.focusSpeedValue, -SPEED_MAX, SPEED_MAX, action.options.op * action.options.step) : action.options.set
				await self.getPTZ('F' + cmdSpeed(self.data.focusSpeedValue + SPEED_OFFSET))
			},
		}

		actions.focusSpeed = {
			name: 'Lens - Focus Speed',
			options: [speedOperation, speedSetting, speedStep],
			callback: async (action) => {
				self.fSpeed = action.options.op !== ACTION_SET ? getNextValue(self.fSpeed, SPEED_MIN, SPEED_MAX, action.options.op * action.options.step) : action.options.set
				self.setVariableValues({ fSpeed: self.fSpeed })
				self.speedChangeEmitter.emit('fSpeed')
			},
		}

		actions.focusFollow = {
			name: 'Lens - Follow Focus',
			options: optSetIncDecStep('Focus setting', 0x555, 0x0, 0xaaa, 10),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, 0x0, 0xaaa, 10))) return
				await self.getPTZ('AXF' + cmdValue(action, 0x555, 0x0, 0xaaa, action.options.step, 3, self.data.focusPosition))
			},
		}
	}

	if (SERIES.capabilities.focusAuto) {
		actions.focusMode = {
			name: 'Lens - Focus Mode',
			options: optSetToggle(e.ENUM_MAN_AUTO),
			callback: async (action) => {
				await self.getCam('OAF:' + cmdEnum(action, e.ENUM_MAN_AUTO, self.data.focusMode))
			},
		}
	}

	if (SERIES.capabilities.focusPushAuto) {
		actions.focusPushAuto = {
			name: 'Lens - Focus Push Auto',
			options: [],
			callback: async (action) => {
				await self.getCam('OSE:69:1')
			},
		}
	}

	if (SERIES.capabilities.ois) {
		actions.ois = {
			name: 'Lens - Image Stabilization Mode',
			options: optSetToggleNextPrev(SERIES.capabilities.ois.dropdown),
			callback: async (action) => {
				await self.getCam('OIS:' + cmdEnum(action, SERIES.capabilities.ois.dropdown, self.data.ois))
			},
		}
	}

	// ##########################
	// #### Exposure Actions ####
	// ##########################

	if (SERIES.capabilities.iris) {
		actions.iris = {
			name: 'Exposure - Iris',
			options: optSetIncDecStep('Iris setting', 0x555, 0x0, 0xaaa, 0x1e),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, 0x0, 0xaaa, 0x1e))) return
				await self.getPTZ('AXI' + cmdValue(action, 0x555, 0x0, 0xaaa, action.options.step, 3, self.data.irisPosition))
			},
		}
	}

	// special case for UB300
	if (SERIES.capabilities.iris && SERIES.id === 'UB300') {
		actions.iris = {
			name: 'Exposure - Iris',
			options: optSetIncDecStep('Iris setting', 0x1ff, 0x0, 0x3ff, 0xa),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, 0x0, 0x3ff, 0xa))) return
				await self.getCam('ORV:' + cmdValue(action, 0x0, 0x0, 0x3ff, action.options.step, 3, self.data.irisVolume))
			},
		}
	}

	if (SERIES.capabilities.irisAuto) {
		actions.irisMode = {
			name: 'Exposure - Iris Mode',
			options: optSetToggle(e.ENUM_MAN_AUTO),
			callback: async (action) => {
				await self.getCam('ORS:' + cmdEnum(action, e.ENUM_MAN_AUTO, self.data.irisMode))
			},
		}
	}

	if (SERIES.capabilities.filter) {
		actions.filter = {
			name: 'Exposure - ND Filter',
			options: optSetToggleNextPrev(SERIES.capabilities.filter.dropdown),
			callback: async (action) => {
				await self.getCam('OFT:' + cmdEnum(action, SERIES.capabilities.filter.dropdown, self.data.filter))
			},
		}
	}

	if (SERIES.capabilities.shutter) {
		if (SERIES.capabilities.shutter) {
			actions.shutter = {
				name: 'Exposure - Shutter',
				options: optSetToggleNextPrev(SERIES.capabilities.shutter.dropdown),
				callback: async (action) => {
					await self.getCam(SERIES.capabilities.shutter.cmd + ':' + cmdEnum(action, SERIES.capabilities.shutter.dropdown, self.data.shutter))
				},
			}
		}

		if (SERIES.capabilities.shutter.inc && SERIES.capabilities.shutter.dec) {
			actions.shutterStepUp = {
				name: 'Exposure - Shutter Step Up',
				options: [],
				callback: async (action) => {
					await self.getCam(SERIES.capabilities.shutter.inc + ':01')
				},
			}

			actions.shutterStepDown = {
				name: 'Exposure - Shutter Step Down',
				options: [],
				callback: async (action) => {
					await self.getCam(SERIES.capabilities.shutter.dec + ':01')
				},
			}
		}
	}

	if (SERIES.capabilities.night) {
		actions.nightMode = {
			name: 'Exposure - Night Mode',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				await self.getPTZ('D6' + cmdEnum(action, e.ENUM_OFF_ON, self.data.nightMode))
			},
		}
	}

	// #########################
	// #### Image Actions ####
	// #########################

	if (SERIES.capabilities.gain.cmd) {
		actions.gain = {
			name: 'Image - Gain',
			options: optSetToggleNextPrev(SERIES.capabilities.gain.dropdown),
			callback: async (action) => {
				await self.getCam(SERIES.capabilities.gain.cmd + ':' + cmdEnum(action, SERIES.capabilities.gain.dropdown, self.data.gain))
			},
		}
	}

	if (SERIES.capabilities.pedestal.cmd) {
		const caps = SERIES.capabilities.pedestal
		actions.ped = {
			name: 'Image - Pedestal',
			options: optSetIncDecStep('Level', 0, -caps.limit, +caps.limit, caps.step),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, -caps.limit, caps.limit, caps.step))) return
				await self.getCam(caps.cmd + ':' + cmdValue(action, caps.offset, -caps.limit, caps.limit, action.options.step, caps.hexlen, self.data.masterPedValue))
			},
		}
	}

	if (SERIES.capabilities.colorPedestal && SERIES.capabilities.colorPedestal.cmd.red) {
		const caps = SERIES.capabilities.colorPedestal
		actions.pedRed = {
			name: 'Image - Red Pedestal',
			options: optSetIncDecStep('Level', 0, -caps.limit, +caps.limit, caps.step),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, -caps.limit, caps.limit, caps.step))) return
				await self.getCam(caps.cmd.red + ':' + cmdValue(action, caps.offset, -caps.limit, caps.limit, action.options.step, caps.hexlen, self.data.redPedValue))
			},
		}
	}

	if (SERIES.capabilities.colorPedestal && SERIES.capabilities.colorPedestal.cmd.blue) {
		const caps = SERIES.capabilities.colorPedestal
		actions.pedBlue = {
			name: 'Image - Blue Pedestal',
			options: optSetIncDecStep('Level', 0, -caps.limit, +caps.limit, caps.step),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, -caps.limit, caps.limit, caps.step))) return
				await self.getCam(caps.cmd.blue + ':' + cmdValue(action, caps.offset, -caps.limit, caps.limit, action.options.step, caps.hexlen, self.data.bluePedValue))
			},
		}
	}

	if (SERIES.capabilities.colorGain && SERIES.capabilities.colorGain.cmd.red) {
		const caps = SERIES.capabilities.colorGain
		actions.gainRed = {
			name: 'Image - Red Gain',
			options: optSetIncDecStep('Level', 0, -caps.limit, +caps.limit, caps.step),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, -caps.limit, caps.limit, caps.step))) return
				await self.getCam(caps.cmd.red + ':' + cmdValue(action, caps.offset, -caps.limit, caps.limit, action.options.step, caps.hexlen, self.data.redGainValue))
			},
		}
	}

	if (SERIES.capabilities.colorGain && SERIES.capabilities.colorGain.cmd.blue) {
		const caps = SERIES.capabilities.colorGain
		actions.gainBlue = {
			name: 'Image - Blue Gain',
			options: optSetIncDecStep('Level', 0, -caps.limit, +caps.limit, caps.step),
			callback: async (action) => {
				if (!(await parseSetIncDecVariables(action, self, -caps.limit, caps.limit, caps.step))) return
				await self.getCam(caps.cmd.blue + ':' + cmdValue(action, caps.offset, -caps.limit, caps.limit, action.options.step, caps.hexlen, self.data.blueGainValue))
			},
		}
	}

	if (SERIES.capabilities.whiteBalance) {
		if (SERIES.capabilities.whiteBalance.dropdown) {
			actions.whiteBalanceMode = {
				name: 'Image - White Balance Mode',
				options: optSetToggleNextPrev(SERIES.capabilities.whiteBalance.dropdown),
				callback: async (action) => {
					await self.getCam('OAW:' + cmdEnum(action, SERIES.capabilities.whiteBalance.dropdown, self.data.whiteBalance))
				},
			}
		}

		actions.whiteBalanceExecAWB = {
			name: 'Image - Execute AWC/AWB',
			options: [],
			callback: async (action) => {
				await self.getCam('OWS')
			},
		}

		actions.whiteBalanceExecABB = {
			name: 'Image - Execute ABC/ABB',
			options: [],
			callback: async (action) => {
				await self.getCam('OAS')
			},
		}
	}

	if (SERIES.capabilities.colorTemperature && SERIES.capabilities.colorTemperature.index) {
		actions.colorTemperature = {
			name: 'Image - Color Temperature',
			options: optSetToggleNextPrev(SERIES.capabilities.colorTemperature.index.dropdown),
			callback: async (action) => {
				await self.getCam(SERIES.capabilities.colorTemperature.index.cmd + ':' + cmdEnum(action, SERIES.capabilities.colorTemperature.index.dropdown, self.data.colorTemperature))
			},
		}
	}

	if (SERIES.capabilities.colorTemperature && SERIES.capabilities.colorTemperature.advanced) {
		if (SERIES.capabilities.colorTemperature.advanced.set) {
			actions.colorTemperature = {
				name: 'Image - Color Temperature',
				options: optSetIncDecStep('Color Temperature [K]', 3200, SERIES.capabilities.colorTemperature.advanced.min, SERIES.capabilities.colorTemperature.advanced.max, 20),
				callback: async (action) => {
					if (!(await parseSetIncDecVariables(action, self, SERIES.capabilities.colorTemperature.advanced.min, SERIES.capabilities.colorTemperature.advanced.max, 20))) return
					switch (action.options.op) {
						case ACTION_SET:
							await self.getCam(SERIES.capabilities.colorTemperature.advanced.set + ':' + toHexString(action.options.set, 5) + ':0')
							break
						case ACTION_INC:
							await self.getCam(SERIES.capabilities.colorTemperature.advanced.inc + ':1')
							break
						case ACTION_DEC:
							await self.getCam(SERIES.capabilities.colorTemperature.advanced.dec + ':1')
							break
					}
				},
			}
		}
	}

	// ########################
	// #### Preset Actions ####
	// ########################

	if (SERIES.capabilities.preset) {
		actions.presetMem = {
			name: 'Preset - Memory Operation',
			options: [
				{
					type: 'dropdown',
					label: 'Action',
					id: 'op',
					default: e.ENUM_PRESET[0].id,
					choices: [
						{ id: 'R', label: 'Recall / Play' },
						{ id: 'M', label: 'Memorize / Save' },
						{ id: 'C', label: 'Clear / Delete' },
					],
				},
				{
					type: 'dropdown',
					label: 'Preset Nr.',
					id: 'val',
					default: e.ENUM_PRESET[0].id,
					choices: e.ENUM_PRESET,
				},
			],
			callback: async (action) => {
				await self.getPTZ(action.options.op + action.options.val)
			},
		}

		actions.presetResetSelectedCompletedState = {
			name: 'Preset - Reset Selected / Completed State',
			options: [],
			callback: async () => {
				self.data.presetSelectedIdx = null
				self.data.presetCompletedIdx = null
				self.checkVariables()
				self.checkFeedbacks()
			},
		}

		actions.presetRecallScope = {
			name: 'Preset - Recall Scope',
			options: optSetToggleNextPrev(e.ENUM_PRESET_SCOPE, 'Preset Recall Scope'),
			callback: async (action) => {
				await self.getCam('OSE:71:' + cmdEnum(action, e.ENUM_PRESET_SCOPE, self.data.presetScope))
			},
		}
	}

	if (SERIES.capabilities.presetSpeed) {
		actions.presetSpeedTime = {
			name: 'Preset - Recall Velocity',
			options: optSetToggleNextPrev(SERIES.capabilities.presetTime ? e.ENUM_PRESET_SPEED_TIME : e.ENUM_PRESET_SPEED, 'Speed / Time'),
			callback: async (action) => {
				const v = cmdEnum(action, SERIES.capabilities.presetTime ? e.ENUM_PRESET_SPEED_TIME : e.ENUM_PRESET_SPEED, self.data.presetSpeed)
				const r = parseInt(v, 16)
				const s = r < 0x001 || r > 0x063
				if (SERIES.capabilities.presetTime) await self.getCam('OSJ:29:' + (s ? '0' : '1'))
				await self.getPTZ('UPVS' + v)
			},
		}

		actions.presetSpeedTable = {
			name: 'Preset - Recall Speed Table',
			options: optSetToggleNextPrev(SERIES.capabilities.presetSpeed.dropdown),
			callback: async (action) => {
				await self.getPTZ('PST' + cmdEnum(action, SERIES.capabilities.presetSpeed.dropdown, self.data.presetSpeedTable))
			},
		}
	}

	if (SERIES.capabilities.presetTime) {
		actions.presetSpeedTimeUnit = {
			name: 'Preset - Recall Velocity Unit',
			options: optSetToggleNextPrev(e.ENUM_PRESET_SPEED_UNIT),
			callback: async (action) => {
				await self.getCam('OSJ:29:' + cmdEnum(action, e.ENUM_PRESET_SPEED_UNIT, self.data.presetSpeedUnit))
			},
		}

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
					required: true,
					range: true,
				},
			],
			callback: async (action) => {
				await self.getCam('OSJ:29:1')
				await self.getPTZ('UPVS' + toHexString(action.options.val, 3))
			},
		}
	}

	// ##############################
	// #### Autotracking Actions ####
	// ##############################

	if (SERIES.capabilities.trackingAuto) {
		actions.autotrackingMode = {
			name: 'Auto Tracking - Mode',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				await self.getCam('OSL:B6:' + cmdEnum(action, e.ENUM_OFF_ON, self.data.autotrackingMode))
			},
		}

		actions.autotrackingAngle = {
			name: 'Auto Tracking - Angle',
			options: optSetToggle(e.ENUM_AUTOTRACKING_ANGLE),
			callback: async (action) => {
				await self.getCam('OSL:B7:' + cmdEnum(action, e.ENUM_AUTOTRACKING_ANGLE, self.data.autotrackingAngle))
			},
		}

		actions.autotrackingStartStop = {
			name: 'Auto Tracking - Start/Stop Tracking',
			options: optSetToggle(e.ENUM_STOP_START),
			callback: async (action) => {
				await self.getCam('OSL:BC:' + cmdEnum(action, e.ENUM_STOP_START, self.data.autotrackingEnabled))
			},
		}
	}

	// ########################
	// #### System Actions ####
	// ########################

	if (SERIES.capabilities.power) {
		actions.power = {
			name: 'System - Power',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				await self.getPTZ('O' + cmdEnum(action, e.ENUM_OFF_ON, self.data.power))
			},
		}
	}

	if (SERIES.capabilities.restart) {
		actions.restart = {
			name: 'System - Restart',
			description: "To perform a remote restart of the camera the username and password for administrator authority are necessary. These are the same credentials that are used to log in to the camera's web interface. The factory default values are 'admin' and '12345'.",
			options: [
				{
					id: 'username',
					type: 'textinput',
					label: 'Username',
					default: 'admin',
					required: true,
				},
				{
					id: 'password',
					type: 'textinput',
					label: 'Password',
					default: '12345',
					required: true,
				},
			],
			callback: async (action) => {
				await self.getWeb('initial?cmd=reset&Randomnum=12345', action.options.username, action.options.password)
			},
		}
	}

	if (SERIES.capabilities.tally) {
		if (SERIES.capabilities.tally2) {
			actions.tally = {
				name: 'System - Red Tally',
				options: optSetToggle(e.ENUM_OFF_ON),
				callback: async (action) => {
					await self.getCam('TLR:' + cmdEnum(action, e.ENUM_OFF_ON, self.data.tally))
				},
			}
			actions.tally2 = {
				name: 'System - Green Tally',
				options: optSetToggle(e.ENUM_OFF_ON),
				callback: async (action) => {
					await self.getCam('TLG:' + cmdEnum(action, e.ENUM_OFF_ON, self.data.tally2))
				},
			}
			if (SERIES.capabilities.tally3) {
				actions.tally3 = {
					name: 'System - Yellow Tally',
					options: optSetToggle(e.ENUM_OFF_ON),
					callback: async (action) => {
						await self.getCam('TLY:' + cmdEnum(action, e.ENUM_OFF_ON, self.data.tally3))
					},
				}
			}
		} else {
			// Use legacy PTZ Tally
			actions.tally = {
				name: 'System - Tally',
				options: optSetToggle(e.ENUM_OFF_ON),
				callback: async (action) => {
					await self.getPTZ('DA' + cmdEnum(action, e.ENUM_OFF_ON, self.data.tally))
				},
			}
		}
	}

	if (SERIES.capabilities.colorbar) {
		actions.colorbar = {
			name: 'System - Color Bar',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				await self.getCam('DCB:' + cmdEnum(action, e.ENUM_OFF_ON, self.data.colorbar))
			},
		}
	}

	if (SERIES.capabilities.install) {
		actions.installPosition = {
			name: 'System - Installation Position',
			options: optSetToggle(e.ENUM_INSTALL_POSITION),
			callback: async (action) => {
				await self.getPTZ('INS' + cmdEnum(action, e.ENUM_INSTALL_POSITION, self.data.installMode))
			},
		}
	}

	if (SERIES.capabilities.recordSD) {
		actions.sdCardRec = {
			name: 'System - SD Card Recording Control',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				var cmd = cmdEnum(action, e.ENUM_OFF_ON, self.data.recording)
				cmd = cmd === '1' ? 'start' : 'end'
				await self.getWeb('sdctrl?save=' + cmd)
			},
		}
	}

	if (SERIES.capabilities.streamSRT) {
		actions.srtStreamCtrl = {
			name: 'Streaming - SRT Caller Control',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				var cmd = cmdEnum(action, e.ENUM_OFF_ON, self.data.srt)
				cmd = cmd === '1' ? 'start' : 'stop'
				await self.getWeb('srt_ctrl?cmd=' + cmd)
			},
		}
	}

	if (SERIES.capabilities.streamTS) {
		actions.tsStreamCtrl = {
			name: 'Streaming - MPEG-TS Output Control',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				var cmd = cmdEnum(action, e.ENUM_OFF_ON, self.data.ts)
				cmd = cmd === '1' ? 'start' : 'stop'
				await self.getWeb('ts_ctrl?cmd=' + cmd)
			},
		}
	}

	if (SERIES.capabilities.streamRTMP) {
		actions.rtmpStreamCtrl = {
			name: 'Streaming - RTMP Push Control',
			options: optSetToggle(e.ENUM_OFF_ON),
			callback: async (action) => {
				var cmd = cmdEnum(action, e.ENUM_OFF_ON, self.data.rtmp)
				cmd = cmd === '1' ? 'start' : 'stop'
				await self.getWeb('rtmp_ctrl?cmd=' + cmd)
			},
		}
	}

	actions.customCommand = {
		name: 'Custom Command',
		description: 'Sends a custom command to the camera. This enables operations that are not (yet) covered by this module. Please read the public protocol specifications for details!',
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
					await self.getCam(action.options.cmd)
					break
				case 1:
					await self.getPTZ(action.options.cmd)
					break
				case 2:
					await self.getWeb(action.options.cmd)
					break
			}
		},
	}

	return actions
}
