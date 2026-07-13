import { combineRgb } from '@companion-module/base'
import { getAndUpdateSeries } from './common.js'
import ICONS from './icons.js'
import { e } from './enum.js'

// Templated presets drive the preset number from a local variable rather than baking it in.
// The `useVar` branch of the preset action/feedbacks expects a 1-based number, which is what
// the local variable carries, so the value can be handed straight through.
const LOCAL_PRESET = { isExpression: true, value: '$(local:preset)' }
const presetMemOptions = (op) => ({ op, val: e.ENUM_PRESET[0].id, useVar: true, valVar: LOCAL_PRESET })
const presetFeedbackOptions = () => ({ option: e.ENUM_PRESET[0].id, useVar: true, optionVar: LOCAL_PRESET })

// Same idea for audio: the channel option is 0-based while labels and variables are 1-based.
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

// A button that toggles a setting and lights up while it is active.
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
	feedbacks: [
		{
			feedbackId,
			...(feedbackOptions ? { options: feedbackOptions } : {}),
			...(isInverted ? { isInverted } : {}),
			style,
		},
	],
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

		presets['pan-tilt-position'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'Pan/Tilt Position',
			style: {
				text: 'P/T Pos.\\n$(generic-module:panPositionDeg)°\\n$(generic-module:tiltPositionDeg)°',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'home',
							options: {},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-speed'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'Speed',
			style: {
				text: 'P/T Speed\\n$(generic-module:ptSpeed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptSpeed',
							options: {
								scope: 'pt',
								op: 's',
								set: 25,
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'ptSpeed',
							options: {
								scope: 'pt',
								op: -1,
								step: 1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'ptSpeed',
							options: {
								scope: 'pt',
								op: 1,
								step: 1,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
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

		presets['lens-zoom-in'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Zoom In',
			style: {
				text: 'ZOOM\\nIN',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [{ actionId: 'zoom', options: { dir: 1 } }],
					up: [{ actionId: 'zoom', options: { dir: 0 } }],
				},
			],
			feedbacks: [],
		}

		presets['lens-zoom-out'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Zoom Out',
			style: {
				text: 'ZOOM\\nOUT',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [{ actionId: 'zoom', options: { dir: -1 } }],
					up: [{ actionId: 'zoom', options: { dir: 0 } }],
				},
			],
			feedbacks: [],
		}

		presets['lens-zoom-speed'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Zoom Speed',
			style: {
				text: 'Zoom\\nSpeed\\n$(generic-module:zSpeed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'zoomSpeed',
							options: { op: 's', set: 25 },
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'zoomSpeed',
							options: { op: -1, step: 1 },
						},
					],
					rotate_right: [
						{
							actionId: 'zoomSpeed',
							options: { op: 1, step: 1 },
						},
					],
				},
			],
			feedbacks: [],
		}
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

		presets['lens-focus-far'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Focus Far',
			style: {
				text: 'FOCUS\\nFAR',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [{ actionId: 'focus', options: { dir: 1 } }],
					up: [{ actionId: 'focus', options: { dir: 0 } }],
				},
			],
			feedbacks: [],
		}

		presets['lens-focus-near'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Focus Near',
			style: {
				text: 'FOCUS\\nNEAR',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [{ actionId: 'focus', options: { dir: -1 } }],
					up: [{ actionId: 'focus', options: { dir: 0 } }],
				},
			],
			feedbacks: [],
		}

		presets['lens-focus-speed'] = {
			type: 'simple',
			category: 'Lens',
			name: 'Focus Speed',
			style: {
				text: 'Focus\\nSpeed\\n$(generic-module:fSpeed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'focusSpeed',
							options: { op: 's', set: 25 },
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'focusSpeed',
							options: { op: -1, step: 1 },
						},
					],
					rotate_right: [
						{
							actionId: 'focusSpeed',
							options: { op: 1, step: 1 },
						},
					],
				},
			],
			feedbacks: [],
		}

		if (SERIES.capabilities.focusAuto) {
			presets['lens-focus-mode'] = {
				type: 'simple',
				category: 'Lens',
				name: 'Focus Mode',
				style: {
					text: 'FOCUS MODE\\n$(generic-module:focusMode)',
					size: '14',
					color: colorWhite,
					bgcolor: colorBlack,
				},
				steps: [
					{
						down: [
							{
								actionId: 'focusMode',
								options: { op: 't' },
							},
						],
						up: [],
					},
				],
				feedbacks: [
					{
						feedbackId: 'focusMode',
						style: {
							color: colorWhite,
							bgcolor: colorRed,
						},
					},
				],
			}
		}

		if (SERIES.capabilities.focusPushAuto) {
			presets['lens-focus-push-auto'] = {
				type: 'simple',
				category: 'Lens',
				name: 'Push Auto Focus',
				style: {
					text: 'PUSH\\nAUTO\\nFOCUS',
					size: '14',
					color: colorWhite,
					bgcolor: colorBlack,
				},
				steps: [
					{
						down: [
							{
								actionId: 'focusPushAuto',
								options: {},
							},
						],
						up: [],
					},
				],
				feedbacks: [],
			}
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

		presets['exposure-iris-up'] = {
			type: 'simple',
			category: 'Exposure',
			name: 'Iris Up',
			style: {
				text: 'IRIS\\nUP',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'iris',
							options: {
								op: 1,
								step: 0x1e,
								useVar: false,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		presets['exposure-iris-down'] = {
			type: 'simple',
			category: 'Exposure',
			name: 'Iris Down',
			style: {
				text: 'IRIS\\nDOWN',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'iris',
							options: {
								op: -1,
								step: 0x1e,
								useVar: false,
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.irisAuto) {
		presets['exposure-iris-mode'] = {
			type: 'simple',
			category: 'Exposure',
			name: 'Iris Mode',
			style: {
				text: 'IRIS MODE\\n$(generic-module:irisMode)',
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
				},
			],
			feedbacks: [
				{
					feedbackId: 'irisMode',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
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
		presets['exposure-night-mode'] = {
			type: 'simple',
			category: 'Exposure',
			name: 'Night Mode',
			style: {
				text: 'Night Mode\\n$(generic-module:nightMode)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'nightMode',
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
					feedbackId: 'nightMode',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
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
		presets['image-chroma-level'] = {
			type: 'simple',
			category: 'Image',
			name: 'Chroma Level',
			style: {
				text: 'Chroma\\n$(generic-module:chromaLevel)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'chromaLevel',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'chromaLevel',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'chromaLevel',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.chromaPhase) {
		presets['image-chroma-phase'] = {
			type: 'simple',
			category: 'Image',
			name: 'Chroma Phase',
			style: {
				text: 'Phase\\n$(generic-module:chromaPhase)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'chromaPhase',
							options: {
								op: 's',
								set: 0,
								useVar: false,
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'chromaPhase',
							options: {
								op: -1,
								step: 1,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'chromaPhase',
							options: {
								op: 1,
								step: 1,
								useVar: false,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.dnr && SERIES.capabilities.dnr.dropdown) {
		presets['image-dnr'] = {
			type: 'simple',
			category: 'Image',
			name: 'DNR',
			style: {
				text: 'DNR\\n$(generic-module:dnr)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'dnr',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'dnr',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'dnr',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.drs && SERIES.capabilities.drs.dropdown) {
		presets['image-drs'] = {
			type: 'simple',
			category: 'Image',
			name: 'DRS',
			style: {
				text: 'DRS\\n$(generic-module:drs)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'drs',
							options: {
								op: 't',
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'drs',
							options: {
								op: -1,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'drs',
							options: {
								op: 1,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.pedestal) {
		presets['image-pedestal'] = {
			type: 'simple',
			category: 'Image',
			name: 'Pedestal',
			style: {
				text: 'Total Ped.\\n$(generic-module:masterPed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorGrey,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ped',
							options: {
								op: 's',
								set: 0,
								useVar: false,
							},
						},
					],
					up: [],
					rotate_left: [
						{
							actionId: 'ped',
							options: {
								op: -1,
								step: 1,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'ped',
							options: {
								op: 1,
								step: 1,
								useVar: false,
							},
						},
					],
				},
			],
			feedbacks: [],
		}
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

		presets['image-awb'] = {
			type: 'simple',
			category: 'Image',
			name: 'Execute Auto White Balance',
			style: {
				text: 'Execute\\nAWB',
				size: '14',
				color: colorBlack,
				bgcolor: colorWhite,
			},
			steps: [
				{
					down: [
						{
							actionId: 'whiteBalanceExecAWB',
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		presets['image-abb'] = {
			type: 'simple',
			category: 'Image',
			name: 'Execute Auto Black Balance',
			style: {
				text: 'Execute\\nABB',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'whiteBalanceExecABB',
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
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
		presets['system-power'] = {
			type: 'simple',
			category: 'System',
			name: 'Power',
			style: {
				text: '⏻ Power\\n$(generic-module:power)',
				size: '14',
				color: colorWhite,
				bgcolor: colorOrange,
			},
			steps: [
				{
					down: [
						{
							actionId: 'power',
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
					feedbackId: 'powerState',
					style: {
						color: colorWhite,
						bgcolor: colorDarkGreen,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.restart) {
		presets['system-restart'] = {
			type: 'simple',
			category: 'System',
			name: 'Restart',
			style: {
				text: 'Restart\\n🗘',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'restart',
							options: {
								username: 'admin',
								password: '12345',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
	}

	if (SERIES.capabilities.colorbar) {
		presets['system-colorbar'] = {
			type: 'simple',
			category: 'System',
			name: 'Color Bar',
			style: {
				text: 'Color Bar\\n$(generic-module:colorbar)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'colorbar',
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
					feedbackId: 'colorbarState',
					style: {
						png64: ICONS.COLORBAR,
						pngalignment: 'center:center',
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.install) {
		presets['system-install-position'] = {
			type: 'simple',
			category: 'System',
			name: 'Installation Position',
			style: {
				text: 'INSTALL. POS.\\n$(generic-module:installMode)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'installPosition',
							options: {
								op: 't',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
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
		presets['system-srt-stream'] = {
			type: 'simple',
			category: 'System',
			name: 'SRT Caller Streaming',
			style: {
				text: 'SRT Caller\\n$(generic-module:streamingSRT)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'srtStreamCtrl',
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
					feedbackId: 'streamStateSRT',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.streamTS) {
		presets['system-ts-stream'] = {
			type: 'simple',
			category: 'System',
			name: 'MPEG-TS Output Streaming',
			style: {
				text: 'MPEG-TS Output\\n$(generic-module:streamingTS)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'tsStreamCtrl',
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
					feedbackId: 'streamStateTS',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.streamRTMP) {
		presets['system-rtmp-stream'] = {
			type: 'simple',
			category: 'System',
			name: 'RTMP Push Streaming',
			style: {
				text: 'RTMP Push\\n$(generic-module:streamingRTMP)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'rtmpStreamCtrl',
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
					feedbackId: 'streamStateRTMP',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	// #################
	// #### Presets ####
	// #################

	if (SERIES.capabilities.presetSpeed && SERIES.capabilities.presetTime) {
		presets['preset-mode'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Preset Recall Mode',
			style: {
				text: 'RECALL MODE\\n$(generic-module:presetSpeedUnit)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetSpeedTimeUnit',
							options: {
								op: 't',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}

		presets['preset-speed-table'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Preset Recall Speed Table',
			style: {
				text: 'SPEED TABLE\\n$(generic-module:presetSpeedTable)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetSpeedTable',
							options: {
								op: 't',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		}
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
		presets['autotracking-mode'] = {
			type: 'simple',
			category: 'Auto Tracking',
			name: 'Auto Tracking Mode',
			style: {
				text: 'Auto Tracking\\n$(generic-module:autotrackingMode)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'autotrackingMode',
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
					feedbackId: 'autotrackingMode',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		presets['autotracking-angle'] = {
			type: 'simple',
			category: 'Auto Tracking',
			name: 'Auto Tracking Angle',
			style: {
				text: 'ANGLE\\n$(generic-module:autotrackingAngle)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'autotrackingAngle',
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
					feedbackId: 'autotrackingAngle',
					options: {
						option: e.ENUM_AUTOTRACKING_ANGLE[0].id,
					},
					isInverted: true,
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

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
		presets['audio-volume'] = {
			type: 'simple',
			category: 'Audio',
			name: 'Audio Volume Level',
			template: {
				variableName: 'channel',
				values: Array.from({ length: SERIES.capabilities.audioVolumeLevel.maxch }, (_, ch) => ({
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
								step: 1,
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
								step: 1,
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
						minLevel: -5,
						maxLevel: 5,
					},
					style: {
						color: colorWhite,
						bgcolor: colorGreen,
					},
				},
				{
					feedbackId: 'audioVolumeLevel',
					options: {
						channel: LOCAL_CHANNEL_0,
						minLevel: 6,
						maxLevel: 20,
					},
					style: {
						color: colorWhite,
						bgcolor: colorOrange,
					},
				},
			],
		}
	}

	return buildPresetDefinitions(presets)
}

// API 2.0 splits presets into a `structure` of UI sections plus the flat preset definitions.
// Categories stay declared inline on each preset above and are lifted out here, so a section
// only ever lists the presets the connected model actually supports.
//
// A preset carrying a `template` is fanned out by Companion into one button per value, rather
// than us emitting near-identical copies. A section's `definitions` may be either a plain list
// of preset ids or a list of groups, but not a mix — so as soon as one preset in a section is
// templated, the section's plain presets are wrapped in a simple group alongside it.
function buildPresetDefinitions(presets) {
	const structure = []
	const sections = new Map()
	const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

	for (const [id, preset] of Object.entries(presets)) {
		const { category, template, ...definition } = preset
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
