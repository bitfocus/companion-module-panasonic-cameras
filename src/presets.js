import { combineRgb } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getAndUpdateSeries } from './common.js'
import ICONS from './icons.js'
import { e } from './enum.js'

// Templated presets drive the preset number from a local variable rather than baking it in.
// The `useVar` branch of the preset action/feedbacks expects a 1-based number, which is what
// the local variable carries, so the value can be handed straight through.
const LOCAL_PRESET = { isExpression: true, value: '$(local:preset)' }
const presetMemOptions = (op) => ({ op, val: e.ENUM_PRESET[0].id, useVar: true, valVar: LOCAL_PRESET })
const presetFeedbackOptions = () => ({ option: e.ENUM_PRESET[0].id, useVar: true, optionVar: LOCAL_PRESET })

// Same for audio: the channel option is 0-based while labels and variables are 1-based.
const LOCAL_CHANNEL_0 = { isExpression: true, value: '$(local:channel) - 1' }

const colorWhite = combineRgb(255, 255, 255)
const colorRed = combineRgb(255, 0, 0)
const colorOrange = combineRgb(255, 102, 0)
const colorYellow = combineRgb(255, 255, 0)
const colorGreen = combineRgb(0, 255, 0)
const colorBlue = combineRgb(0, 51, 204)
const colorDarkRed = combineRgb(102, 0, 0)
const colorDarkYellow = combineRgb(102, 102, 0)
const colorDarkBlue = combineRgb(0, 0, 102)
const colorDarkGreen = combineRgb(0, 102, 0)
const colorGrey = combineRgb(51, 51, 51)
const colorBlack = combineRgb(0, 0, 0)

// #########################
// #### Preset builders ####
// #########################

// A button that drives the camera while held: one action on press, the counterpart on release.
// The pan/tilt and lens jog buttons are all this shape, differing only in icon and direction.
const jogPreset = (category, name, icon, actionId, downOptions, upOptions) => ({
	type: 'simple',
	category,
	name,
	style: {
		text: '',
		png64: icon,
		pngalignment: 'center:center',
		size: '18',
		color: colorWhite,
		bgcolor: colorBlack,
	},
	steps: [
		{
			down: [{ actionId, options: downOptions }],
			up: [{ actionId, options: upOptions }],
		},
	],
	feedbacks: [],
})

// A rotary knob showing a value: press sets it, turning steps it. `set` is what a press applies.
const knobPreset = (category, name, text, actionId, set, { bgcolor = colorBlack, step = 1, extra = {} } = {}) => ({
	type: 'simple',
	category,
	name,
	style: { text, size: '14', color: colorWhite, bgcolor },
	steps: [
		{
			down: [{ actionId, options: { ...extra, op: 's', set, useVar: false } }],
			up: [],
			rotate_left: [{ actionId, options: { ...extra, op: -1, step, useVar: false } }],
			rotate_right: [{ actionId, options: { ...extra, op: 1, step, useVar: false } }],
		},
	],
	feedbacks: [],
})

// A knob over a speed: press returns it to the middle of the range, turning nudges it.
const speedKnobPreset = (category, name, text, actionId, extra = {}) => ({
	type: 'simple',
	category,
	name,
	style: { text, size: '14', color: colorWhite, bgcolor: colorBlack },
	steps: [
		{
			down: [{ actionId, options: { ...extra, op: 's', set: 25 } }],
			up: [],
			rotate_left: [{ actionId, options: { ...extra, op: -1, step: 1 } }],
			rotate_right: [{ actionId, options: { ...extra, op: 1, step: 1 } }],
		},
	],
	feedbacks: [],
})

// A knob over a list of modes: press toggles, turning steps through the list.
const enumKnobPreset = (category, name, text, actionId) => ({
	type: 'simple',
	category,
	name,
	style: { text, size: '14', color: colorWhite, bgcolor: colorBlack },
	steps: [
		{
			down: [{ actionId, options: { op: 't' } }],
			up: [],
			rotate_left: [{ actionId, options: { op: -1 } }],
			rotate_right: [{ actionId, options: { op: 1 } }],
		},
	],
	feedbacks: [],
})

// A button that toggles a setting, and lights up while it is active if a feedback is given.
const togglePreset = (
	category,
	name,
	text,
	actionId,
	feedbackId,
	style,
	{ size = '14', color = colorWhite, bgcolor = colorBlack, feedbackOptions, isInverted } = {},
) => ({
	type: 'simple',
	category,
	name,
	style: { text, size, color, bgcolor },
	steps: [{ down: [{ actionId, options: { op: 't' } }], up: [] }],
	feedbacks: feedbackId
		? [
				{
					feedbackId,
					...(feedbackOptions ? { options: feedbackOptions } : {}),
					...(isInverted ? { isInverted } : {}),
					style,
				},
			]
		: [],
})

// A button that fires one action on press and does nothing on release.
const momentaryPreset = (
	category,
	name,
	text,
	actionId,
	options,
	{ color = colorWhite, bgcolor = colorBlack } = {},
) => ({
	type: 'simple',
	category,
	name,
	style: { text, size: '14', color, bgcolor },
	steps: [{ down: [{ actionId, ...(options ? { options } : {}) }], up: [] }],
	feedbacks: [],
})

// Like jogPreset, but labelled with text rather than an icon: drive in a direction while held,
// stop on release.
const textJogPreset = (category, name, text, actionId, dir) => ({
	type: 'simple',
	category,
	name,
	style: { text, size: '14', color: colorWhite, bgcolor: colorBlack },
	steps: [
		{
			down: [{ actionId, options: { dir } }],
			up: [{ actionId, options: { dir: 0 } }],
		},
	],
	feedbacks: [],
})

// A button that applies one fixed value and lights up while the camera is on that value.
const valuePreset = (category, name, text, actionId, feedbackId, value, style) => ({
	type: 'simple',
	category,
	name,
	style: { text, size: '14', color: colorWhite, bgcolor: colorBlack },
	steps: [{ down: [{ actionId, options: { op: 's', set: value } }], up: [] }],
	feedbacks: [{ feedbackId, options: { option: value }, style }],
})

export function getPresetDefinitions(self) {
	const presets = {}

	const SERIES = getAndUpdateSeries(self)

	// ##########################
	// #### Pan/Tilt Presets ####
	// ##########################

	if (SERIES.capabilities.panTilt) {
		// The eight jog directions differ only in icon and the two-digit pan/tilt direction code.
		// '11' is the stop code that every one of them releases to.
		const PAN_TILT_JOG = [
			['pan-tilt-up', 'UP', ICONS.UP, '12'],
			['pan-tilt-down', 'DOWN', ICONS.DOWN, '10'],
			['pan-tilt-left', 'LEFT', ICONS.LEFT, '01'],
			['pan-tilt-right', 'RIGHT', ICONS.RIGHT, '21'],
			['pan-tilt-up-right', 'UP RIGHT', ICONS.UP_RIGHT, '22'],
			['pan-tilt-up-left', 'UP LEFT', ICONS.UP_LEFT, '02'],
			['pan-tilt-down-left', 'DOWN LEFT', ICONS.DOWN_LEFT, '00'],
			['pan-tilt-down-right', 'DOWN RIGHT', ICONS.DOWN_RIGHT, '20'],
		]

		for (const [id, name, icon, dir] of PAN_TILT_JOG) {
			presets[id] = jogPreset('Pan/Tilt', name, icon, 'ptMove', { dir }, { dir: '11' })
		}

		presets['pan-tilt-position'] = momentaryPreset(
			'Pan/Tilt',
			'Pan/Tilt Position',
			'P/T Pos.\\n$(generic-module:panPositionDeg)°\\n$(generic-module:tiltPositionDeg)°',
			'home',
			{},
		)

		presets['pan-tilt-speed'] = speedKnobPreset(
			'Pan/Tilt',
			'Speed',
			'P/T Speed\\n$(generic-module:ptSpeed)',
			'ptSpeed',
			{ scope: 'pt' },
		)
	}

	// ######################
	// #### Lens Presets ####
	// ######################

	if (SERIES.capabilities.zoom) {
		presets['lens-zoom'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Zoom',
			style: {
				text: 'ZOOM\\n$(generic-module:zoomPosition)\\n$(generic-module:zoomPositionBar)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'zoomControl',
							options: { op: 's', set: 0 },
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'zoomControl',
							options: { op: -1, step: 7 },
						},
					],
					rotate_right: [
						{
							actionId: 'zoomControl',
							options: { op: 1, step: 7 },
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'zoomControl',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		presets['lens-zoom-in'] = textJogPreset('Lens', 'Zoom In', 'ZOOM\\nIN', 'zoom', 1)

		presets['lens-zoom-out'] = textJogPreset('Lens', 'Zoom Out', 'ZOOM\\nOUT', 'zoom', -1)

		presets['lens-zoom-speed'] = speedKnobPreset(
			'Lens',
			'Zoom Speed',
			'Zoom\\nSpeed\\n$(generic-module:zSpeed)',
			'zoomSpeed',
		)
	}

	if (SERIES.capabilities.focus) {
		presets['lens-focus'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Focus',
			style: {
				text: 'FOCUS\\n$(generic-module:focusPosition)\\n$(generic-module:focusPositionBar)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'focusPushAuto',
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'focusFollow',
							options: {
								op: -1,
								step: 10,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'focusFollow',
							options: {
								op: 1,
								step: 10,
								useVar: false,
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['lens-focus-far'] = textJogPreset('Lens', 'Focus Far', 'FOCUS\\nFAR', 'focus', 1)

		presets['lens-focus-near'] = textJogPreset('Lens', 'Focus Near', 'FOCUS\\nNEAR', 'focus', -1)

		presets['lens-focus-speed'] = speedKnobPreset(
			'Lens',
			'Focus Speed',
			'Focus\\nSpeed\\n$(generic-module:fSpeed)',
			'focusSpeed',
		)

		if (SERIES.capabilities.focusAuto) {
			presets['lens-focus-mode'] = togglePreset(
				'Lens',
				'Focus Mode',
				'FOCUS MODE\\n$(generic-module:focusMode)',
				'focusMode',
				'focusMode',
				{ color: colorWhite, bgcolor: colorRed },
			)
		}

		if (SERIES.capabilities.focusPushAuto) {
			presets['lens-focus-push-auto'] = momentaryPreset(
				'Lens',
				'Push Auto Focus',
				'PUSH\\nAUTO\\nFOCUS',
				'focusPushAuto',
				{},
			)
		}
	}

	if (SERIES.capabilities.ois) {
		presets[`lens-ois-mode`] = {
			type: 'simple',
			category: 'Lens',
			name: 'O.I.S. Mode',
			style: {
				text: 'O.I.S.\n$(generic-module:ois)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ois',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'ois',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'ois',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'oisMode',
					options: {
						option: SERIES.capabilities.ois.dropdown[0].id,
					},
					isInverted: true,
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	// ##########################
	// #### Exposure Presets ####
	// ##########################

	if (SERIES.capabilities.iris) {
		presets['exposure-iris'] = {
			type: 'simple',
			category: 'Exposure',
			name: 'Iris',
			style: {
				text:
					'IRIS\\n$(generic-module:' +
					(SERIES.capabilities.irisF ? 'irisF' : 'irisPosition') +
					')\\n$(generic-module:irisPositionBar)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'irisMode',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'iris',
							options: {
								op: -1,
								step: 30,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'iris',
							options: {
								op: 1,
								step: 30,
								useVar: false,
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['exposure-iris-up'] = momentaryPreset('Exposure', 'Iris Up', 'IRIS\\nUP', 'iris', {
			op: 1,
			step: 0x1e,
			useVar: false,
		})

		presets['exposure-iris-down'] = momentaryPreset('Exposure', 'Iris Down', 'IRIS\\nDOWN', 'iris', {
			op: -1,
			step: 0x1e,
			useVar: false,
		})
	}

	if (SERIES.capabilities.irisAuto) {
		presets['exposure-iris-mode'] = togglePreset(
			'Exposure',
			'Iris Mode',
			'IRIS MODE\\n$(generic-module:irisMode)',
			'irisMode',
			'irisMode',
			{ color: colorWhite, bgcolor: colorRed },
		)
	}

	if (SERIES.capabilities.shutter) {
		presets[`exposure-shutter`] = {
			type: 'simple',
			category: 'Exposure',
			name: 'Shutter',
			style: {
				text: 'Shutter\\n$(generic-module:shutter)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'shutter',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'shutter',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'shutter',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'shutter',
					options: {
						option: SERIES.capabilities.shutter.dropdown[0].id,
					},
					isInverted: true,
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		if (SERIES.capabilities.shutter.inc && SERIES.capabilities.shutter.dec) {
			presets[`exposure-shutter-step`] = {
				type: 'simple',
				category: 'Exposure',
				name: 'Shutter Step',
				style: {
					text: 'Shutter Step\\n$(generic-module:shutterStep)',
					size: '14',
					color: colorWhite,
					bgcolor: colorBlack,
				},
				steps: [
					{
						down: [],
						up: [],
						rotate_left: [
							{
								actionId: 'shutterStepDown',
							},
						],
						rotate_right: [
							{
								actionId: 'shutterStepUp',
							},
						],
					},
				],
				feedbacks: [],
			}
		}
	}

	if (SERIES.capabilities.filter) {
		presets['exposure-filter'] = {
			type: 'simple',
			category: 'Exposure',
			name: 'ND Filter',
			style: {
				text: 'ND Filter\\n$(generic-module:filter)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'filter',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'filter',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'filter',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'filter',
					options: {
						option: SERIES.capabilities.filter.dropdown[0].id,
					},
					isInverted: true,
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.night) {
		presets['exposure-night-mode'] = togglePreset(
			'Exposure',
			'Night Mode',
			'Night Mode\\n$(generic-module:nightMode)',
			'nightMode',
			'nightMode',
			{ color: colorWhite, bgcolor: colorRed },
		)
	}

	// #########################
	// #### Image Presets ####
	// #########################

	if (SERIES.capabilities.gain) {
		presets[`image-gain`] = {
			type: 'simple',
			category: 'Image',
			name: 'Gain',
			style: {
				text: 'GAIN\\n$(generic-module:gain)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'gain',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'gain',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'gain',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'gain',
					options: {
						option: SERIES.capabilities.gain.dropdown[0].id,
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.chromaLevel && SERIES.capabilities.chromaLevel.dropdown) {
		presets['image-chroma-level'] = enumKnobPreset(
			'Image',
			'Chroma Level',
			'Chroma\\n$(generic-module:chromaLevel)',
			'chromaLevel',
		)
	}

	if (SERIES.capabilities.chromaPhase) {
		presets['image-chroma-phase'] = knobPreset(
			'Image',
			'Chroma Phase',
			'Phase\\n$(generic-module:chromaPhase)',
			'chromaPhase',
			0,
		)
	}

	if (SERIES.capabilities.dnr && SERIES.capabilities.dnr.dropdown) {
		presets['image-dnr'] = enumKnobPreset('Image', 'DNR', 'DNR\\n$(generic-module:dnr)', 'dnr')
	}

	if (SERIES.capabilities.drs && SERIES.capabilities.drs.dropdown) {
		presets['image-drs'] = enumKnobPreset('Image', 'DRS', 'DRS\\n$(generic-module:drs)', 'drs')
	}

	if (SERIES.capabilities.pedestal) {
		presets['image-pedestal'] = knobPreset('Image', 'Pedestal', 'Total Ped.\\n$(generic-module:masterPed)', 'ped', 0, {
			bgcolor: colorGrey,
			step: SERIES.capabilities.pedestal.step,
		})
	}

	// Red/blue/green gain and pedestal are the same knob on six channels. Green is gated
	// separately because only some cameras drive it.
	const COLOR_KNOBS = [
		[
			'colorGain',
			'gain',
			'Gain',
			'Gain',
			[
				['red', 'image-red-gain', 'Red Gain', 'redGain', colorRed],
				['blue', 'image-blue-gain', 'Blue Gain', 'blueGain', colorBlue],
				['green', 'image-green-gain', 'Green Gain', 'greenGain', colorGreen],
			],
		],
		[
			'colorPedestal',
			'ped',
			'Pedestal',
			'Ped.',
			[
				['red', 'image-red-ped', 'Red Pedestal', 'redPed', colorDarkRed],
				['blue', 'image-blue-ped', 'Blue Pedestal', 'bluePed', colorDarkBlue],
				['green', 'image-green-ped', 'Green Pedestal', 'greenPed', colorDarkGreen],
			],
		],
	]

	for (const [capability, actionPrefix, , label, channels] of COLOR_KNOBS) {
		const caps = SERIES.capabilities[capability]
		if (!caps) continue

		for (const [channel, id, name, variable, bgcolor] of channels) {
			if (!caps.cmd[channel]) continue

			const actionId = actionPrefix + channel[0].toUpperCase() + channel.slice(1)
			const title = channel[0].toUpperCase() + channel.slice(1)
			presets[id] = knobPreset('Image', name, `${title} ${label}\\n$(generic-module:${variable})`, actionId, 0, {
				bgcolor,
			})
		}
	}

	if (SERIES.capabilities.whiteBalance) {
		if (SERIES.capabilities.whiteBalance.dropdown) {
			presets[`image-whitebalance`] = {
				type: 'simple',
				category: 'Image',
				name: 'White Balance',
				style: {
					text: 'WB Mode\\n$(generic-module:whiteBalance)',
					size: '14',
					color: colorBlack,
					bgcolor: colorWhite,
				},
				steps: [
					{
						down: [
							{
								actionId: 'whiteBalanceMode',
								options: {
									op: 't',
								},
							},
						],
						up: [],
						rotate_left: [
							{
								actionId: 'whiteBalanceMode',
								options: {
									op: -1,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'whiteBalanceMode',
								options: {
									op: 1,
								},
							},
						],
					},
				],
				feedbacks: [
					{
						feedbackId: 'whiteBalance',
						options: {
							option: SERIES.capabilities.whiteBalance.dropdown[0].id,
						},
						style: {
							color: colorWhite,
							bgcolor: colorRed,
						},
					},
				],
			}
		}

		// The knob only turns, so it works the same whether the camera can be given a colour
		// temperature outright or only stepped towards one. Options the model's action does not
		// have (a UB300 has no step size) are dropped when the preset is built.
		if (SERIES.capabilities.colorTemperature) {
			presets['image-colortemp'] = {
				type: 'simple',
				category: 'Image',
				name: 'Color Temperature',
				style: {
					text: 'Temp.\\n$(generic-module:colorTemperature)',
					size: '14',
					color: colorBlack,
					bgcolor: colorWhite,
				},
				steps: [
					{
						down: [],
						up: [],
						rotate_left: [
							{
								actionId: 'colorTemperature',
								options: {
									op: -1,
									step: 20,
									useVar: false,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'colorTemperature',
								options: {
									op: 1,
									step: 20,
									useVar: false,
								},
							},
						],
					},
				],
				feedbacks: [],
			}
		}

		presets['image-awb'] = momentaryPreset(
			'Image',
			'Execute Auto White Balance',
			'Execute\\nAWB',
			'whiteBalanceExecAWB',
			undefined,
			{ color: colorBlack, bgcolor: colorWhite },
		)

		presets['image-abb'] = momentaryPreset(
			'Image',
			'Execute Auto Black Balance',
			'Execute\\nABB',
			'whiteBalanceExecABB',
			undefined,
		)
	}

	// ########################
	// #### System Presets ####
	// ########################

	if (SERIES.capabilities.error || SERIES.capabilities.version) {
		presets['system-cam-info'] = {
			type: 'simple',
			category: 'System',
			name: 'Camera title, model, version and error indication',
			style: {
				text: '$(generic-module:title)\\n$(generic-module:model)\\n$(generic-module:version)',
				size: 'auto',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [],
			feedbacks: SERIES.capabilities.error
				? [
						{
							feedbackId: 'error',
							style: {
								color: colorRed,
								bgcolor: colorBlack,
							},
						},
					]
				: [],
		}
	}

	if (SERIES.capabilities.tally) {
		presets['system-tally'] = togglePreset(
			'System',
			'Red Tally',
			'TALLY',
			'tally',
			'tallyState',
			{ color: colorWhite, bgcolor: colorRed },
			{ size: '18', color: colorDarkRed },
		)
	}

	if (SERIES.capabilities.tally2) {
		presets['system-tally2'] = togglePreset(
			'System',
			'Green Tally',
			'TALLY',
			'tally2',
			'tally2State',
			{ color: colorWhite, bgcolor: colorGreen },
			{ size: '18', color: colorDarkGreen },
		)
	}

	if (SERIES.capabilities.tally3) {
		presets['system-tally3'] = togglePreset(
			'System',
			'Yellow Tally',
			'TALLY',
			'tally3',
			'tally3State',
			{ color: colorWhite, bgcolor: colorYellow },
			{ size: '18', color: colorDarkYellow },
		)
	}

	if (SERIES.capabilities.power) {
		presets['system-power'] = togglePreset(
			'System',
			'Power',
			'⏻ Power\\n$(generic-module:power)',
			'power',
			'powerState',
			{ color: colorWhite, bgcolor: colorDarkGreen },
			{ bgcolor: colorOrange },
		)
	}

	if (SERIES.capabilities.restart) {
		presets['system-restart'] = momentaryPreset('System', 'Restart', 'Restart\\n🗘', 'restart', {
			username: 'admin',
			password: '12345',
		})
	}

	if (SERIES.capabilities.colorbar) {
		// The only toggle whose lit state also swaps in an image.
		presets['system-colorbar'] = togglePreset(
			'System',
			'Color Bar',
			'Color Bar\\n$(generic-module:colorbar)',
			'colorbar',
			'colorbarState',
			{ color: colorWhite, bgcolor: colorRed, png64: ICONS.COLORBAR, pngalignment: 'center:center' },
		)
	}

	if (SERIES.capabilities.install) {
		presets['system-install-position'] = togglePreset(
			'System',
			'Installation Position',
			'INSTALL. POS.\\n$(generic-module:installMode)',
			'installPosition',
			null,
			null,
		)
	}

	if (SERIES.capabilities.videoFormat) {
		presets['system-video-format'] = {
			type: 'simple',
			category: 'System',
			name: 'Video Format',
			style: {
				text: 'Format\\n$(generic-module:videoFormat)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [],
					up: [],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.recordSD) {
		presets['system-sd-recording'] = {
			type: 'simple',
			category: 'System',
			name: 'SD Card Recording',
			style: {
				text: 'SD Card Recording\\n$(generic-module:recording)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'sdCardRec',
							options: {
								op: 't',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'sdSlotState',
					style: {
						color: colorWhite,
						bgcolor: colorDarkGreen,
					},
				},
				{
					feedbackId: 'sdRecState',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.streamSRT) {
		presets['system-srt-stream'] = togglePreset(
			'System',
			'SRT Caller Streaming',
			'SRT Caller\\n$(generic-module:streamingSRT)',
			'srtStreamCtrl',
			'streamStateSRT',
			{ color: colorWhite, bgcolor: colorRed },
		)
	}

	if (SERIES.capabilities.streamTS) {
		presets['system-ts-stream'] = togglePreset(
			'System',
			'MPEG-TS Output Streaming',
			'MPEG-TS Output\\n$(generic-module:streamingTS)',
			'tsStreamCtrl',
			'streamStateTS',
			{ color: colorWhite, bgcolor: colorRed },
		)
	}

	if (SERIES.capabilities.streamRTMP) {
		presets['system-rtmp-stream'] = togglePreset(
			'System',
			'RTMP Push Streaming',
			'RTMP Push\\n$(generic-module:streamingRTMP)',
			'rtmpStreamCtrl',
			'streamStateRTMP',
			{ color: colorWhite, bgcolor: colorRed },
		)
	}

	// #################
	// #### Presets ####
	// #################

	if (SERIES.capabilities.presetSpeed && SERIES.capabilities.presetTime) {
		presets['preset-mode'] = togglePreset(
			'Preset Memory',
			'Preset Recall Mode',
			'RECALL MODE\\n$(generic-module:presetSpeedUnit)',
			'presetSpeedTimeUnit',
			null,
			null,
		)

		presets['preset-speed-table'] = togglePreset(
			'Preset Memory',
			'Preset Recall Speed Table',
			'SPEED TABLE\\n$(generic-module:presetSpeedTable)',
			'presetSpeedTable',
			null,
			null,
		)
	}

	if (SERIES.capabilities.presetSpeed) {
		presets[`preset-velocity`] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Preset Recall Velocity',
			style: {
				text: 'RECALL SPD/TM\\n$(generic-module:presetSpeed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetSpeedTime',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'presetSpeedTime',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'presetSpeedTime',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['preset-speed-high'] = valuePreset(
			'Preset Memory',
			'Set Recall Speed High',
			'RECALL SPEED\\nHIGH',
			'presetSpeedTime',
			'presetSpeedTime',
			'999',
			{ color: colorWhite, bgcolor: colorRed },
		)

		presets['preset-speed-mid'] = valuePreset(
			'Preset Memory',
			'Set Recall Speed Mid',
			'RECALL SPEED\\nMID',
			'presetSpeedTime',
			'presetSpeedTime',
			'625',
			{ color: colorWhite, bgcolor: colorRed },
		)

		presets['preset-speed-low'] = valuePreset(
			'Preset Memory',
			'Set Recall Speed Low',
			'RECALL SPEED\\nLOW',
			'presetSpeedTime',
			'presetSpeedTime',
			'275',
			{ color: colorWhite, bgcolor: colorRed },
		)
	}

	if (SERIES.capabilities.preset) {
		presets['preset-scope-a'] = valuePreset(
			'Preset Memory',
			'Preset Recall Scope A',
			'Preset Recall Scope\\nA',
			'presetRecallScope',
			'presetRecallScope',
			'0',
			{ color: colorWhite, bgcolor: colorRed },
		)

		presets['preset-scope-b'] = valuePreset(
			'Preset Memory',
			'Preset Recall Scope B',
			'Preset Recall Scope\\nB',
			'presetRecallScope',
			'presetRecallScope',
			'1',
			{ color: colorWhite, bgcolor: colorRed },
		)

		presets['preset-scope-c'] = valuePreset(
			'Preset Memory',
			'Preset Recall Scope C',
			'Preset Recall Scope\\nC',
			'presetRecallScope',
			'presetRecallScope',
			'2',
			{ color: colorWhite, bgcolor: colorRed },
		)

		presets['preset-clear-all'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Clear All Presets (hold 3s)',
			style: {
				text: 'CLEAR ALL\\nPRESETS',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [],
					up: [],
					3000: {
						options: { runWhileHeld: true },
						actions: [
							{
								actionId: 'presetClearAll',
								options: {
									confirm: true,
								},
							},
						],
					},
				},
			],
			feedbacks: [],
		}

		// One templated definition instead of a preset per memory slot. The template group in
		// buildPresetDefinitions() fans `preset` out over the slots this model actually has —
		// the old loop hardcoded 100, so a 9-preset camera was offered 91 dead buttons.
		// The action/feedback `useVar` paths already take a 1-based preset number, which is
		// exactly what the local variable holds, so no zero-padding is needed here.
		presets['preset-memory'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Recall, Store or Clear Preset',
			template: {
				variableName: 'preset',
				values: Array.from({ length: SERIES.capabilities.preset }, (_, i) => ({
					name: 'Recall, Store or Clear Preset ' + (i + 1).toString(),
					value: i + 1,
				})),
			},
			localVariables: [{ variableType: 'simple', variableName: 'preset', startupValue: 1 }],
			style: {
				text: 'PRESET\\n$(local:preset)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetResetSelectedCompletedState',
							options: {},
						},
					],
					up: [
						{
							actionId: 'presetMem',
							options: presetMemOptions('R'),
						},
					],
					1000: {
						options: { runWhileHeld: true },
						actions: [
							{
								actionId: 'presetMem',
								options: presetMemOptions('M'),
							},
						],
					},
					2000: {
						options: { runWhileHeld: true },
						actions: [
							{
								actionId: 'presetMem',
								options: presetMemOptions('C'),
							},
						],
					},
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetMemory',
					options: presetFeedbackOptions(),
					style: {
						color: colorWhite,
						bgcolor: colorGrey,
					},
				},
				...(SERIES.capabilities.presetThumbnails
					? [
							{
								feedbackId: 'presetThumbnail',
								options: presetFeedbackOptions(),
							},
						]
					: []),
				{
					feedbackId: 'presetSelected',
					options: presetFeedbackOptions(),
					style: {
						color: colorWhite,
						bgcolor: colorOrange,
					},
				},
				{
					feedbackId: 'presetComplete',
					options: presetFeedbackOptions(),
					style: {
						color: colorWhite,
						bgcolor: colorBlue,
					},
				},
			],
		}
	}

	// #######################
	// #### Auto Tracking ####
	// #######################

	if (SERIES.capabilities.trackingAuto) {
		presets['autotracking-mode'] = togglePreset(
			'Auto Tracking',
			'Auto Tracking Mode',
			'Auto Tracking\\n$(generic-module:autotrackingMode)',
			'autotrackingMode',
			'autotrackingMode',
			{ color: colorWhite, bgcolor: colorRed },
		)

		presets['autotracking-angle'] = togglePreset(
			'Auto Tracking',
			'Auto Tracking Angle',
			'ANGLE\\n$(generic-module:autotrackingAngle)',
			'autotrackingAngle',
			'autotrackingAngle',
			{ color: colorWhite, bgcolor: colorRed },
			{ feedbackOptions: { option: e.ENUM_AUTOTRACKING_ANGLE[0].id }, isInverted: true },
		)

		presets['autotracking-status'] = {
			type: 'simple',
			category: 'Auto Tracking',
			name: 'Auto Tracking Status & Start/Stop',
			style: {
				text: 'TRACK.\\nStart/Stop',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'autotrackingStartStop',
							options: {
								op: 't',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'autotrackingStatus',
					options: {
						option: e.ENUM_AUTOTRACKING_ANGLE[1].id,
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
				{
					feedbackId: 'autotrackingStatus',
					options: {
						option: e.ENUM_AUTOTRACKING_ANGLE[2].id,
					},
					style: {
						color: colorWhite,
						bgcolor: colorBlue,
					},
				},
			],
		}
	}

	// ########################
	// #### Audio Presets ####
	// ########################

	if (SERIES.capabilities.audioVolumeLevel) {
		const audio = SERIES.capabilities.audioVolumeLevel
		presets['audio-volume'] = {
			type: 'simple',
			category: 'Audio',
			name: 'Audio Volume Level',
			template: {
				variableName: 'channel',
				values: Array.from({ length: audio.maxch }, (_, ch) => ({
					name: `Audio Volume Level Channel ${ch + 1}`,
					value: ch + 1,
				})),
			},
			localVariables: [{ variableType: 'simple', variableName: 'channel', startupValue: 1 }],
			style: {
				text: 'Audio CH$(local:channel)\\n$(generic-module:audioVolumeLevel$(local:channel))',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'audioVolumeLevel',
							options: {
								channel: LOCAL_CHANNEL_0,
								op: 's',
								set: 0,
								useVar: false,
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'audioVolumeLevel',
							options: {
								channel: LOCAL_CHANNEL_0,
								op: -1,
								step: audio.step,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'audioVolumeLevel',
							options: {
								channel: LOCAL_CHANNEL_0,
								op: 1,
								step: audio.step,
								useVar: false,
							},
						},
					],
				},
			],
			feedbacks: [
				{
					feedbackId: 'audioVolumeLevel',
					options: {
						channel: LOCAL_CHANNEL_0,
						option: 0,
					},
					isInverted: true,
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	return buildPresetDefinitions(presets, self)
}

// Companion validates every option an entity carries against the definition, and a stored option
// it never got is as invalid as a wrong one — for a dropdown, undefined is simply "not in the list
// of choices", which takes the whole action down. A preset that spells out only the options it
// cares about (`{ op: 't' }`, the rest hidden behind an isVisibleExpression) therefore produces a
// button that cannot run. In 1.x the omission was harmless, which is how the presets above came to
// be written that way; rather than restating every option on every preset, reconcile each one
// against the very definitions Companion validates it against: fill in what the preset left out,
// and drop what this model's action does not have (an Increase/Decrease-only camera has no step
// size, but the preset it shares with the others still names one).
function optionSpecs(definitions) {
	return Object.fromEntries(
		Object.entries(definitions).map(([id, definition]) => {
			const fields = (definition.options ?? []).filter((o) => o.id !== undefined && o.type !== 'static-text')
			return [
				id,
				{
					ids: fields.map((field) => field.id),
					defaults: Object.fromEntries(
						fields.filter((field) => field.default !== undefined).map((field) => [field.id, field.default]),
					),
				},
			]
		}),
	)
}

const reconcileOptions = (entities, idKey, specs) =>
	(entities ?? []).map((entity) => {
		const spec = specs[entity[idKey]]
		if (!spec) return entity

		const options = { ...spec.defaults }
		for (const id of spec.ids) {
			if (entity.options && id in entity.options) options[id] = entity.options[id]
		}
		return { ...entity, options }
	})

// API 2.0 splits presets into a `structure` of UI sections plus the flat preset definitions.
// Categories stay declared inline on each preset above and are lifted out here, so a section
// only ever lists the presets the connected model actually supports.
//
// A preset carrying a `template` is fanned out by Companion into one button per value, rather
// than us emitting near-identical copies. A section's `definitions` may be either a plain list
// of preset ids or a list of groups, but not a mix — so as soon as one preset in a section is
// templated, the section's plain presets are wrapped in a simple group alongside it.
function buildPresetDefinitions(presets, self) {
	const structure = []
	const sections = new Map()
	const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

	const actionSpecs = optionSpecs(getActionDefinitions(self))
	const feedbackSpecs = optionSpecs(getFeedbackDefinitions(self))

	for (const [id, preset] of Object.entries(presets)) {
		const { category, template, ...definition } = preset

		// A step maps each action-set name (down, up, rotate_left, …) to its actions, and may carry
		// non-action keys such as `options` alongside them.
		definition.steps = definition.steps.map((step) =>
			Object.fromEntries(
				Object.entries(step).map(([set, actions]) => [
					set,
					Array.isArray(actions) ? reconcileOptions(actions, 'actionId', actionSpecs) : actions,
				]),
			),
		)
		definition.feedbacks = reconcileOptions(definition.feedbacks, 'feedbackId', feedbackSpecs)

		presets[id] = definition

		let section = sections.get(category)
		if (!section) {
			section = { id: slug(category), name: category, plain: [], templates: [] }
			sections.set(category, section)
		}

		if (template) {
			section.templates.push({
				id: `${slug(category)}-${id}`,
				type: 'template',
				name: definition.name,
				presetId: id,
				templateVariableName: template.variableName,
				templateValues: template.values,
			})
		} else {
			section.plain.push(id)
		}
	}

	for (const { id, name, plain, templates } of sections.values()) {
		const definitions = templates.length
			? [...(plain.length ? [{ id: `${id}-general`, type: 'simple', name, presets: plain }] : []), ...templates]
			: plain
		structure.push({ id, name, definitions })
	}

	return { structure, presets }
}
