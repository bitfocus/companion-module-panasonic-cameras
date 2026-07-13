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

export function getPresetDefinitions(self) {
	const presets = {}

	const colorWhite = combineRgb(255, 255, 255)
	const colorRed = combineRgb(255, 0, 0)
	const colorOrange = combineRgb(255, 102, 0)
	const colorYellow = combineRgb(255, 255, 0)
	const colorGreen = combineRgb(0, 255, 0)
	//const colorPurple = combineRgb(255, 0, 255)
	//const colorActiveBlue = combineRgb(0, 51, 204)
	const colorBlue = combineRgb(0, 51, 204)
	const colorDarkRed = combineRgb(102, 0, 0)
	const colorDarkYellow = combineRgb(102, 102, 0)
	const colorDarkBlue = combineRgb(0, 0, 102)
	const colorDarkGreen = combineRgb(0, 102, 0)
	const colorGrey = combineRgb(51, 51, 51)
	const colorBlack = combineRgb(0, 0, 0)

	const SERIES = getAndUpdateSeries(self)
	// console.log(SERIES);

	// ##########################
	// #### Pan/Tilt Presets ####
	// ##########################

	if (SERIES.capabilities.panTilt) {
		presets['pan-tilt-up'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'UP',
			style: {
				text: '',
				png64: ICONS.UP,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '12',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-down'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'DOWN',
			style: {
				text: '',
				png64: ICONS.DOWN,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '10',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-left'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'LEFT',
			style: {
				text: '',
				png64: ICONS.LEFT,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '01',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-right'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'RIGHT',
			style: {
				text: '',
				png64: ICONS.RIGHT,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '21',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-up-right'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'UP RIGHT',
			style: {
				text: '',
				png64: ICONS.UP_RIGHT,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '22',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-up-left'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'UP LEFT',
			style: {
				text: '',
				png64: ICONS.UP_LEFT,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '02',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-down-left'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'DOWN LEFT',
			style: {
				text: '',
				png64: ICONS.DOWN_LEFT,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '00',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
		}

		presets['pan-tilt-down-right'] = {
			type: 'simple',
			category: 'Pan/Tilt',
			name: 'DOWN RIGHT',
			style: {
				text: '',
				png64: ICONS.DOWN_RIGHT,
				pngalignment: 'center:center',
				size: '18',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'ptMove',
							options: {
								dir: '20',
							},
						},
					],
					up: [
						{
							actionId: 'ptMove',
							options: {
								dir: '11',
							},
						},
					],
				},
			],
			feedbacks: [],
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
				text: 'IRIS\\n$(generic-module:' + (SERIES.capabilities.irisF ? 'irisF' : 'irisPosition') + ')\\n$(generic-module:irisPositionBar)',
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

	if (SERIES.capabilities.colorGain) {
		presets['image-red-gain'] = {
			type: 'simple',
			category: 'Image',
			name: 'Red Gain',
			style: {
				text: 'Red Gain\\n$(generic-module:redGain)',
				size: '14',
				color: colorWhite,
				bgcolor: colorRed,
			},
			steps: [
				{
					down: [
						{
							actionId: 'gainRed',
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
							actionId: 'gainRed',
							options: {
								op: -1,
								step: 1,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'gainRed',
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

		presets['image-blue-gain'] = {
			type: 'simple',
			category: 'Image',
			name: 'Blue Gain',
			style: {
				text: 'Blue Gain\\n$(generic-module:blueGain)',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlue,
			},
			steps: [
				{
					down: [
						{
							actionId: 'gainBlue',
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
							actionId: 'gainBlue',
							options: {
								op: -1,
								step: 1,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'gainBlue',
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

		if (SERIES.capabilities.colorGain.cmd.green) {
			presets['image-green-gain'] = {
				type: 'simple',
				category: 'Image',
				name: 'Green Gain',
				style: {
					text: 'Green Gain\\n$(generic-module:greenGain)',
					size: '14',
					color: colorWhite,
					bgcolor: colorGreen,
				},
				steps: [
					{
						down: [
							{
								actionId: 'gainGreen',
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
								actionId: 'gainGreen',
								options: {
									op: -1,
									step: 1,
									useVar: false,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'gainGreen',
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
	}

	if (SERIES.capabilities.colorPedestal) {
		presets['image-red-ped'] = {
			type: 'simple',
			category: 'Image',
			name: 'Red Pedestal',
			style: {
				text: 'Red Ped.\\n$(generic-module:redPed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorDarkRed,
			},
			steps: [
				{
					down: [
						{
							actionId: 'pedRed',
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
							actionId: 'pedRed',
							options: {
								op: -1,
								step: 1,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'pedRed',
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

		presets['image-blue-ped'] = {
			type: 'simple',
			category: 'Image',
			name: 'Blue Pedestal',
			style: {
				text: 'Blue Ped.\\n$(generic-module:bluePed)',
				size: '14',
				color: colorWhite,
				bgcolor: colorDarkBlue,
			},
			steps: [
				{
					down: [
						{
							actionId: 'pedBlue',
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
							actionId: 'pedBlue',
							options: {
								op: -1,
								step: 1,
								useVar: false,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'pedBlue',
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

		if (SERIES.capabilities.colorPedestal.cmd.green) {
			presets['image-green-ped'] = {
				type: 'simple',
				category: 'Image',
				name: 'Green Pedestal',
				style: {
					text: 'Green Ped.\\n$(generic-module:greenPed)',
					size: '14',
					color: colorWhite,
					bgcolor: colorDarkGreen,
				},
				steps: [
					{
						down: [
							{
								actionId: 'pedGreen',
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
								actionId: 'pedGreen',
								options: {
									op: -1,
									step: 1,
									useVar: false,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'pedGreen',
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
		presets['system-tally'] = {
			type: 'simple',
			category: 'System',
			name: 'Red Tally',
			style: {
				text: 'TALLY',
				size: '18',
				color: colorDarkRed,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'tally',
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
					feedbackId: 'tallyState',
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.tally2) {
		presets['system-tally2'] = {
			type: 'simple',
			category: 'System',
			name: 'Green Tally',
			style: {
				text: 'TALLY',
				size: '18',
				color: colorDarkGreen,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'tally2',
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
					feedbackId: 'tally2State',
					style: {
						color: colorWhite,
						bgcolor: colorGreen,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.tally3) {
		presets['system-tally3'] = {
			type: 'simple',
			category: 'System',
			name: 'Yellow Tally',
			style: {
				text: 'TALLY',
				size: '18',
				color: colorDarkYellow,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'tally3',
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
					feedbackId: 'tally3State',
					style: {
						color: colorWhite,
						bgcolor: colorYellow,
					},
				},
			],
		}
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

		presets['preset-speed-high'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Set Recall Speed High',
			style: {
				text: 'RECALL SPEED\\nHIGH',
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
								op: 's',
								set: '999',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetSpeedTime',
					options: {
						option: '999',
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		presets['preset-speed-mid'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Set Recall Speed Mid',
			style: {
				text: 'RECALL SPEED\\nMID',
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
								op: 's',
								set: '625',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetSpeedTime',
					options: {
						option: '625',
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		presets['preset-speed-low'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Set Recall Speed Low',
			style: {
				text: 'RECALL SPEED\\nLOW',
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
								op: 's',
								set: '275',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetSpeedTime',
					options: {
						option: '275',
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}
	}

	if (SERIES.capabilities.preset) {
		presets['preset-scope-a'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Preset Recall Scope A',
			style: {
				text: 'Preset Recall Scope\\nA',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetRecallScope',
							options: {
								op: 's',
								set: '0',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetRecallScope',
					options: {
						option: '0',
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		presets['preset-scope-b'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Preset Recall Scope B',
			style: {
				text: 'Preset Recall Scope\\nB',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetRecallScope',
							options: {
								op: 's',
								set: '1',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetRecallScope',
					options: {
						option: '1',
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

		presets['preset-scope-c'] = {
			type: 'simple',
			category: 'Preset Memory',
			name: 'Preset Recall Scope C',
			style: {
				text: 'Preset Recall Scope\\nC',
				size: '14',
				color: colorWhite,
				bgcolor: colorBlack,
			},
			steps: [
				{
					down: [
						{
							actionId: 'presetRecallScope',
							options: {
								op: 's',
								set: '2',
							},
						},
					],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'presetRecallScope',
					options: {
						option: '2',
					},
					style: {
						color: colorWhite,
						bgcolor: colorRed,
					},
				},
			],
		}

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
		const definitions = templates.length ? [...(plain.length ? [{ id: `${id}-general`, type: 'simple', name, presets: plain }] : []), ...templates] : plain
		structure.push({ id, name, definitions })
	}

	return { structure, presets }
}
