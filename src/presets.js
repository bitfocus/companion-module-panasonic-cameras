import { combineRgb } from '@companion-module/base'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { seriesOf, optionSpecs } from './common.js'
import ICONS from './icons.js'
import { e } from './enum.js'

// Preset option is 0-based, local variable is 1-based; subtract the offset.
const LOCAL_PRESET_0 = { isExpression: true, value: '$(local:preset) - 1' }
const presetMemOptions = (op) => ({ op, val: LOCAL_PRESET_0 })
const presetFeedbackOptions = () => ({ option: LOCAL_PRESET_0 })

// Audio channel option 0-based, labels/variables 1-based.
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

// ##########################
// #### Button graphics ####
// ##########################

// A layered preset hands Companion the drawing elements directly. The alternative, `simple`, still
// takes the 1.x style object, but there `size` is a pixel height on a 72px button that the host
// rescales on import (×2.1 with a topbar, ×1/0.6 without) — which is why a preset written as
// `size: '14'` read as 29.4 in the button properties. Here fontsize is what the field says it is: a
// percentage of the element's own drawing area.
const SIZE = 24
const SIZE_LARGE = 32 // the tally captions and the jog icons, a third larger than SIZE

// The host's own ids for the stack it used to synthesise from a legacy style. Reusing them keeps a
// button imported from an older version pointing its overrides at the same layers.
const BG = 'box0'
const IMAGE = 'image0'
const TEXT = 'text0'

// A layered element takes the image as a data URL; only the legacy path wrapped bare base64 for us.
const dataUrl = (png64) => 'data:image/png;base64,' + png64

const align = (alignment) => {
	if (!alignment) return {}
	const [halign, valign] = alignment.split(':')
	return { halign, valign }
}

// Background, image, text, in the order the host itself stacked them; Companion prepends the canvas.
// Every button carries all three even when it draws no image, exactly as the legacy conversion did —
// a feedback can then fill one in without the preset having to anticipate it.
const layers = ({
	text = '',
	size = SIZE,
	color = colorWhite,
	alignment,
	bgcolor = colorBlack,
	png64,
	pngalignment,
} = {}) => [
	{ id: BG, name: 'Background', type: 'box', color: bgcolor },
	{
		id: IMAGE,
		name: 'Image',
		type: 'image',
		base64Image: png64 ? dataUrl(png64) : null,
		...align(pngalignment),
	},
	{
		id: TEXT,
		name: 'Text',
		type: 'text',
		text,
		// 'auto' was "fill the button, shrink until it fits", which is fontsize 100 plus the shrink flag.
		fontsize: size === 'auto' ? 100 : size,
		fontsizeAllowShrink: size === 'auto',
		color,
		...align(alignment),
	},
]

// A feedback no longer carries a style, it names the element properties it overrides. The value has
// to be wrapped: Companion drops any override that is not an ExpressionOrValue, and a feedback left
// with none of them is dropped along with it.
const set = (elementId, elementProperty, value) => ({
	elementId,
	elementProperty,
	override: { isExpression: false, value },
})

// An advanced feedback returns a legacy style object instead of fixed values, so its overrides name
// which key of that result feeds each element property. Both of this module's advanced feedbacks
// deliver a picture; the preset thumbnail sends no alignment with it, and an override whose key the
// result omits simply contributes nothing — which is what the host's own conversion relied on too.
const advancedImage = [
	set(IMAGE, 'base64Image', 'png64'),
	set(IMAGE, 'halign', 'pngalignment'),
	set(IMAGE, 'valign', 'pngalignment'),
]

// Takes the same bag the 1.x feedback style did, so a preset still says what it wants lit rather
// than which layer holds it. Nullish-guarded: some presets pass a null style beside a null feedback.
const overrides = (style) => {
	const { color, bgcolor, png64, pngalignment } = style ?? {}

	return [
		...(bgcolor !== undefined ? [set(BG, 'color', bgcolor)] : []),
		...(color !== undefined ? [set(TEXT, 'color', color)] : []),
		...(png64 !== undefined ? [set(IMAGE, 'base64Image', dataUrl(png64))] : []),
		...Object.entries(align(pngalignment)).map(([property, value]) => set(IMAGE, property, value)),
	]
}

// #########################
// #### Preset builders ####
// #########################

// Held button: action on press, counterpart on release.
const jogPreset = (category, name, icon, actionId, downOptions, upOptions) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ png64: icon, size: SIZE_LARGE }),
	steps: [
		{
			down: [{ actionId, options: downOptions }],
			up: [{ actionId, options: upOptions }],
		},
	],
	feedbacks: [],
})

// Rotary knob: press sets value (`set`), turn steps it.
const knobPreset = (category, name, text, actionId, value, { bgcolor = colorBlack, step = 1, extra = {} } = {}) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text, bgcolor }),
	steps: [
		{
			down: [{ actionId, options: { ...extra, op: 's', set: value } }],
			up: [],
			rotate_left: [{ actionId, options: { ...extra, op: -1, step } }],
			rotate_right: [{ actionId, options: { ...extra, op: 1, step } }],
		},
	],
	feedbacks: [],
})

// Speed knob: press centres the range, turn nudges it.
const speedKnobPreset = (category, name, text, actionId, extra = {}) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text }),
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

// Mode knob: press toggles, turn steps through the list.
const enumKnobPreset = (category, name, text, actionId) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text }),
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

// Toggle button; lights up while active if a feedback is given.
const togglePreset = (
	category,
	name,
	text,
	actionId,
	feedbackId,
	activeStyle,
	{ size = SIZE, color = colorWhite, bgcolor = colorBlack, feedbackOptions, isInverted, extra = {} } = {},
) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text, size, color, bgcolor }),
	steps: [{ down: [{ actionId, options: { ...extra, op: 't' } }], up: [] }],
	feedbacks: feedbackId
		? [
				{
					feedbackId,
					...(feedbackOptions ? { options: feedbackOptions } : {}),
					...(isInverted ? { isInverted } : {}),
					styleOverrides: overrides(activeStyle),
				},
			]
		: [],
})

// Fires one action on press.
const momentaryPreset = (
	category,
	name,
	text,
	actionId,
	options,
	{ color = colorWhite, bgcolor = colorBlack } = {},
) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text, color, bgcolor }),
	steps: [{ down: [{ actionId, ...(options ? { options } : {}) }], up: [] }],
	feedbacks: [],
})

// Text-labelled jog: drive while held, stop on release.
const textJogPreset = (category, name, text, actionId, dir) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text }),
	steps: [
		{
			down: [{ actionId, options: { dir } }],
			up: [{ actionId, options: { dir: 0 } }],
		},
	],
	feedbacks: [],
})

// Applies a fixed value; lights up while on that value.
const valuePreset = (category, name, text, actionId, feedbackId, value, activeStyle) => ({
	type: 'layered',
	category,
	name,
	elements: layers({ text }),
	steps: [{ down: [{ actionId, options: { op: 's', set: value } }], up: [] }],
	feedbacks: [{ feedbackId, options: { option: value }, styleOverrides: overrides(activeStyle) }],
})

export function getPresetDefinitions(self) {
	const presets = {}

	const SERIES = seriesOf(self)

	// ##########################
	// #### Pan/Tilt Presets ####
	// ##########################

	if (SERIES.capabilities.panTilt) {
		// Icon + two-digit direction code; '11' is the stop code released to.
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

		if (SERIES.capabilities.panTiltLimit) {
			const PAN_TILT_LIMIT = [
				['pan-tilt-limit-up', '1', 'Tilt Up', 'limitUp'],
				['pan-tilt-limit-down', '2', 'Tilt Down', 'limitDown'],
				['pan-tilt-limit-left', '3', 'Pan Left', 'limitLeft'],
				['pan-tilt-limit-right', '4', 'Pan Right', 'limitRight'],
			]

			for (const [id, dir, label, variable] of PAN_TILT_LIMIT) {
				presets[id] = togglePreset(
					'Pan/Tilt',
					`Movement Range Limit ${label}`,
					`LIMIT\\n${label}\\n$(generic-module:${variable})`,
					'ptLimit',
					'ptLimit',
					{ color: colorWhite, bgcolor: colorRed },
					{ extra: { dir }, feedbackOptions: { option: dir } },
				)
			}
		}
	}

	// ######################
	// #### Lens Presets ####
	// ######################

	if (SERIES.capabilities.zoom) {
		presets['lens-zoom'] = {
			type: 'layered',
			category: 'Lens',
			name: 'Zoom',
			elements: layers({ text: 'ZOOM\\n$(generic-module:zoomPosition)\\n$(generic-module:zoomPositionBar)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
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
			type: 'layered',
			category: 'Lens',
			name: 'Focus',
			elements: layers({ text: 'FOCUS\\n$(generic-module:focusPosition)\\n$(generic-module:focusPositionBar)' }),
			steps: [
				{
					down: SERIES.capabilities.focusPushAuto ? [{ actionId: 'focusPushAuto' }] : [],
					up: [],
					rotate_left: [
						{
							actionId: 'focusFollow',
							options: {
								op: -1,
								step: 10,
							},
						},
					],
					rotate_right: [
						{
							actionId: 'focusFollow',
							options: {
								op: 1,
								step: 10,
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
			type: 'layered',
			category: 'Lens',
			name: 'O.I.S. Mode',
			elements: layers({ text: 'O.I.S.\n$(generic-module:ois)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
				},
			],
		}
	}

	// ##########################
	// #### Exposure Presets ####
	// ##########################

	if (SERIES.capabilities.iris) {
		const position = SERIES.capabilities.irisFollowPosition ? 'irisFollowPosition' : 'irisPosition'

		presets['exposure-iris'] = {
			type: 'layered',
			category: 'Exposure',
			name: 'Iris',
			elements: layers({
				text:
					'IRIS\\n$(generic-module:' +
					(SERIES.capabilities.irisF ? 'irisF' : position) +
					')\\n$(generic-module:' +
					position +
					'Bar)',
			}),
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
							},
						},
					],
					rotate_right: [
						{
							actionId: 'iris',
							options: {
								op: 1,
								step: 30,
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
		})

		presets['exposure-iris-down'] = momentaryPreset('Exposure', 'Iris Down', 'IRIS\\nDOWN', 'iris', {
			op: -1,
			step: 0x1e,
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
			type: 'layered',
			category: 'Exposure',
			name: 'Shutter',
			elements: layers({ text: 'Shutter\\n$(generic-module:shutter)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
				},
			],
		}

		if (SERIES.capabilities.shutter.inc && SERIES.capabilities.shutter.dec) {
			presets[`exposure-shutter-step`] = {
				type: 'layered',
				category: 'Exposure',
				name: 'Shutter Step',
				elements: layers({ text: 'Shutter Step\\n$(generic-module:shutterStep)' }),
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
			type: 'layered',
			category: 'Exposure',
			name: 'ND Filter',
			elements: layers({ text: 'ND Filter\\n$(generic-module:filter)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
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
			type: 'layered',
			category: 'Image',
			name: 'Gain',
			elements: layers({ text: 'GAIN\\n$(generic-module:gain)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
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

	// Same knob for R/B/G gain and pedestal; green gated per-model.
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
				type: 'layered',
				category: 'Image',
				name: 'White Balance',
				elements: layers({
					text: 'WB Mode\\n$(generic-module:whiteBalance)',
					color: colorBlack,
					bgcolor: colorWhite,
				}),
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
						styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
					},
				],
			}
		}

		// Knob only turns; unsupported options (e.g. UB300 step size) dropped at build.
		if (SERIES.capabilities.colorTemperature) {
			presets['image-colortemp'] = {
				type: 'layered',
				category: 'Image',
				name: 'Color Temperature',
				elements: layers({
					text: 'Temp.\\n$(generic-module:colorTemperature)',
					color: colorBlack,
					bgcolor: colorWhite,
				}),
				steps: [
					{
						down: [],
						up: [],
						rotate_left: [
							{
								actionId: 'colorTemperature',
								options: {
									op: -1,
									step: 1,
								},
							},
						],
						rotate_right: [
							{
								actionId: 'colorTemperature',
								options: {
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
			type: 'layered',
			category: 'System',
			name: 'Camera title, model, version and error indication',
			elements: layers({
				text: '$(generic-module:title)\\n$(generic-module:model)\\n$(generic-module:version)',
				size: 'auto',
			}),
			steps: [],
			feedbacks: SERIES.capabilities.error
				? [
						{
							feedbackId: 'error',
							styleOverrides: overrides({ color: colorRed, bgcolor: colorBlack }),
						},
					]
				: [],
		}
	}

	if (SERIES.capabilities.imageTransmission) {
		// Feedbacks apply in order, last wins; red listed last so on-air always shows.
		const tally = (capability, feedbackId, bgcolor) =>
			SERIES.capabilities[capability] ? [{ feedbackId, styleOverrides: overrides({ color: colorWhite, bgcolor }) }] : []

		presets['system-image'] = {
			type: 'layered',
			category: 'System',
			name: 'Live camera image',
			elements: layers({
				text: '$(generic-module:title)',
				alignment: 'center:bottom', // keep title clear of picture
			}),
			canvas: { decoration: 'none' }, // the old show_topbar: false
			steps: [],
			feedbacks: [
				{ feedbackId: 'liveImage', styleOverrides: advancedImage },
				...tally('tally2', 'tally2State', colorGreen),
				...tally('tally3', 'tally3State', colorYellow),
				...tally('tally', 'tallyState', colorRed),
			],
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
			{ size: SIZE_LARGE, color: colorDarkRed },
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
			{ size: SIZE_LARGE, color: colorDarkGreen },
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
			{ size: SIZE_LARGE, color: colorDarkYellow },
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
		// Only toggle whose lit state also swaps in an image.
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
			type: 'layered',
			category: 'System',
			name: 'Video Format',
			elements: layers({ text: 'Format\\n$(generic-module:videoFormat)' }),
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
			type: 'layered',
			category: 'System',
			name: 'SD Card Recording',
			elements: layers({ text: 'SD Card Recording\\n$(generic-module:recording)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorDarkGreen }),
				},
				{
					feedbackId: 'sdRecState',
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
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
			type: 'layered',
			category: 'Preset Memory',
			name: 'Preset Recall Velocity',
			elements: layers({ text: 'RECALL SPD/TM\\n$(generic-module:presetSpeed)' }),
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

	// Scoping a recall is its own capability: the AW-UE4 stores and recalls presets but has no OSE:71.
	if (SERIES.capabilities.preset && SERIES.capabilities.presetScope) {
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
	}

	if (SERIES.capabilities.preset) {
		presets['preset-clear-all'] = {
			type: 'layered',
			category: 'Preset Memory',
			name: 'Clear All Presets (hold 3s)',
			elements: layers({ text: 'CLEAR ALL\\nPRESETS' }),
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

		// Templated over the model's actual preset slots (not a hardcoded 100).
		presets['preset-memory'] = {
			type: 'layered',
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
			elements: layers({ text: 'PRESET\\n$(local:preset)' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorGrey }),
				},
				...(SERIES.capabilities.presetThumbnails
					? [
							{
								feedbackId: 'presetThumbnail',
								options: presetFeedbackOptions(),
								styleOverrides: advancedImage,
							},
						]
					: []),
				{
					feedbackId: 'presetSelected',
					options: presetFeedbackOptions(),
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorOrange }),
				},
				{
					feedbackId: 'presetComplete',
					options: presetFeedbackOptions(),
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorBlue }),
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
			type: 'layered',
			category: 'Auto Tracking',
			name: 'Auto Tracking Status & Start/Stop',
			elements: layers({ text: 'TRACK.\\nStart/Stop' }),
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
				},
				{
					feedbackId: 'autotrackingStatus',
					options: {
						option: e.ENUM_AUTOTRACKING_ANGLE[2].id,
					},
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorBlue }),
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
			type: 'layered',
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
			elements: layers({ text: 'Audio CH$(local:channel)\\n$(generic-module:audioVolumeLevel$(local:channel))' }),
			steps: [
				{
					down: [
						{
							actionId: 'audioVolumeLevel',
							options: {
								channel: LOCAL_CHANNEL_0,
								op: 's',
								set: 0,
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
					styleOverrides: overrides({ color: colorWhite, bgcolor: colorRed }),
				},
			],
		}
	}

	return buildPresetDefinitions(presets, self)
}

// Companion validates every option, so fill in ones a preset omits and drop ones this model's
// action lacks (e.g. no step size on an Inc/Dec-only camera). upgrades.js does the same on disk.
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

// API 2.0 splits presets into a `structure` of sections plus flat definitions; categories are
// lifted from each preset. A section's `definitions` must be all plain ids or all groups, not a
// mix, so once one preset is templated the plain ones are wrapped in a group alongside it.
function buildPresetDefinitions(presets, self) {
	const structure = []
	const sections = new Map()
	const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-')

	const actionSpecs = optionSpecs(getActionDefinitions(self))
	const feedbackSpecs = optionSpecs(getFeedbackDefinitions(self))

	for (const [id, preset] of Object.entries(presets)) {
		const { category, template, ...definition } = preset

		// A step maps action-set names to actions, plus non-action keys like `options`.
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
