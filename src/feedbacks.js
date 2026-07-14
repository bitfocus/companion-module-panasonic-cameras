import { combineRgb } from '@companion-module/base'
import { getAndUpdateSeries, constrainRange } from './common.js'
import { e } from './enum.js'
import ICONS from './icons.js'

const colorWhite = combineRgb(255, 255, 255)
const colorRed = combineRgb(255, 0, 0)
const colorGreen = combineRgb(0, 255, 0)
const colorOrange = combineRgb(255, 102, 0)
const colorBlue = combineRgb(0, 51, 204)
const colorGrey = combineRgb(51, 51, 51)

const STYLE_RED = { color: colorWhite, bgcolor: colorRed }
const STYLE_GREEN = { color: colorWhite, bgcolor: colorGreen }
const STYLE_ORANGE = { color: colorWhite, bgcolor: colorOrange }
const STYLE_BLUE = { color: colorWhite, bgcolor: colorBlue }
const STYLE_GREY = { color: colorWhite, bgcolor: colorGrey }

// A feedback that reports a camera state which is simply on or off.
// `isActive` is called on every evaluation, so it must read self.data rather than close over a value.
const stateFeedback = (name, description, isActive, style = STYLE_RED) => ({
	type: 'boolean',
	name,
	description,
	defaultStyle: { ...style },
	options: [],
	callback: () => isActive(),
})

// A feedback that lights up while the camera's current setting equals the one picked in the dropdown.
// `current` is likewise re-read on every evaluation, and is handed the feedback for the settings that
// are read per channel rather than per camera. `options` are extra fields shown ahead of the dropdown,
// such as the audio channel to look at.
const selectionFeedback = (
	name,
	description,
	label,
	choices,
	current,
	{ defaultIndex = 0, style = STYLE_RED, options = [] } = {},
) => ({
	type: 'boolean',
	name,
	description,
	defaultStyle: { ...style },
	options: [
		...options,
		{
			type: 'dropdown',
			label,
			id: 'option',
			default: choices[defaultIndex].id,
			choices,
		},
	],
	callback: (feedback) => current(feedback) === feedback.options.option,
})

// Preset number option set with optional variable support (dropdown / variable toggled by checkbox)
function optPreset(max) {
	return [
		{
			type: 'dropdown',
			label: 'Preset',
			id: 'option',
			default: e.ENUM_PRESET[0].id,
			choices: e.ENUM_PRESET.slice(0, max),
			isVisibleExpression: '!$(options:useVar)',
		},
		{
			id: 'optionVar',
			type: 'textinput',
			label: 'Preset # variable',
			default: '1',
			useVariables: true,
			tooltip: `This expression should return a preset number in the range 1 to ${max}. Numeric values outside this range will be constrained to this range. Invalid (unreadable) values disable the feedback.`,
			isVisibleExpression: '$(options:useVar)',
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

// Resolve the selected preset to its 0-based index, or null when a variable expression is unreadable
function parsePresetIdx(feedback, max) {
	if (feedback.options.useVar) {
		const num = constrainRange(parseInt(feedback.options.optionVar), 1, max)
		if (isNaN(num)) return null
		return num - 1
	}
	return parseInt(feedback.options.option)
}

// ##########################
// #### Define Feedbacks ####
// ##########################
export function getFeedbackDefinitions(self) {
	const feedbacks = {}

	const SERIES = getAndUpdateSeries(self)
	const caps = SERIES.capabilities

	// ---- System ----

	if (caps.error) {
		feedbacks.error = stateFeedback(
			'System - Error Condition',
			'Indicates if an error condition currently exists',
			() => self.data.error !== '00',
		)
	}

	if (caps.power) {
		feedbacks.powerState = stateFeedback(
			'System - Power State',
			'Indicates if the camera is currently fully powered',
			() => self.data.power === '1',
		)
	}

	if (caps.colorbar) {
		feedbacks.colorbarState = stateFeedback(
			'System - Color Bar State',
			'Indicates if the color bar is currently enabled',
			() => self.data.colorbar === '1',
			{ ...STYLE_RED, png64: ICONS.COLORBAR, pngalignment: 'center:center' },
		)
	}

	if (caps.tally) {
		feedbacks.tallyState = stateFeedback(
			'System - Red Tally State',
			'Indicates if the red Tally is currently active',
			() => self.data.tally === '1',
		)
	}

	if (caps.tally2) {
		feedbacks.tally2State = stateFeedback(
			'System - Green Tally State',
			'Indicates if the green Tally is currently active',
			() => self.data.tally2 === '1',
			STYLE_GREEN,
		)
	}

	if (caps.tally3) {
		feedbacks.tally3State = stateFeedback(
			'System - Yellow Tally State',
			'Indicates if the yellow Tally is currently active',
			() => self.data.tally3 === '1',
			STYLE_ORANGE,
		)
	}

	if (caps.install) {
		feedbacks.installState = selectionFeedback(
			'System - Install Position',
			'Indicates if the selected mounting position is currently active',
			'Position',
			e.ENUM_INSTALL_POSITION,
			() => self.data.installMode,
		)
	}

	// ---- Lens ----

	if (caps.focusAuto) {
		feedbacks.focusMode = stateFeedback(
			'Lens - Focus Mode Auto',
			'Indicates if Auto Focus is currently enabled',
			() => self.data.focusMode === '1',
		)
	}

	if (caps.irisAuto) {
		feedbacks.irisMode = stateFeedback(
			'Lens - Iris Mode Auto',
			'Indicates if Auto Iris is currently enabled',
			() => self.data.irisMode === '1',
		)
	}

	if (caps.ois) {
		feedbacks.oisMode = selectionFeedback(
			'Lens - Image Stabilization',
			'Indicates if the selected image stabilization mode is currently active',
			'Mode',
			caps.ois.dropdown,
			() => self.data.ois,
		)
	}

	if (caps.zoom) {
		feedbacks.zoomControl = stateFeedback(
			'Lens - Zoom Control',
			'Indicates if Zoom is currently in operation',
			() => self.data.zoomSpeedValue != 0,
		)
	}

	// ---- Auto Tracking ----

	if (caps.trackingAuto) {
		feedbacks.autotrackingMode = stateFeedback(
			'Auto Tracking - On/Off',
			'Indicates if Auto Tracking is enabled',
			() => self.data.autotrackingMode === '1',
		)

		feedbacks.autotrackingAngle = selectionFeedback(
			'Auto Tracking - Angle',
			'Indicates if the selected angle is currently active',
			'State',
			e.ENUM_AUTOTRACKING_ANGLE,
			() => self.data.autotrackingAngle,
			{ defaultIndex: 2 },
		)

		feedbacks.autotrackingStatus = selectionFeedback(
			'Auto Tracking - Status',
			'Indicates if the selected status is currently active',
			'Status',
			e.ENUM_AUTOTRACKING_STATUS,
			() => self.data.autotrackingStatus,
			{ defaultIndex: 1 },
		)
	}

	// ---- Preset memory ----

	if (caps.preset) {
		feedbacks.presetSpeedTime = selectionFeedback(
			'Preset - Recall Speed/Time',
			'Indicates if the selected preset recall velocity is currently set',
			'Speed / Time',
			caps.presetTime ? e.ENUM_PRESET_SPEED_TIME : e.ENUM_PRESET_SPEED,
			() => self.data.presetSpeed,
		)

		feedbacks.presetRecallScope = selectionFeedback(
			'Preset - Recall Scope',
			'Indicates if the selected preset recall scope is currently active',
			'Scope',
			e.ENUM_PRESET_SCOPE,
			() => self.data.presetScope,
		)

		feedbacks.presetSelected = {
			type: 'boolean',
			name: 'Preset - Selected / Active',
			description: 'Indicates if the selected preset is currently active (last selected)',
			defaultStyle: { ...STYLE_ORANGE },
			options: optPreset(caps.preset),
			callback: (feedback) => {
				const idx = parsePresetIdx(feedback, caps.preset)
				if (idx === null) return false
				return self.data.presetEntries[idx] === '1' && self.data.presetSelectedIdx === idx
			},
		}

		feedbacks.presetComplete = {
			type: 'boolean',
			name: 'Preset - Recall Completion Notification',
			description: 'Indicates if the last recall to the selected preset is completed',
			defaultStyle: { ...STYLE_BLUE },
			options: optPreset(caps.preset),
			callback: (feedback) => {
				const idx = parsePresetIdx(feedback, caps.preset)
				if (idx === null) return false
				return self.data.presetEntries[idx] === '1' && self.data.presetCompletedIdx === idx
			},
		}

		feedbacks.presetMemory = {
			type: 'boolean',
			name: 'Preset - Memory State',
			description: 'Indicates if the selected preset memory is in use',
			defaultStyle: { ...STYLE_GREY },
			options: optPreset(caps.preset),
			callback: (feedback) => {
				const idx = parsePresetIdx(feedback, caps.preset)
				if (idx === null) return false
				return self.data.presetEntries[idx] === '1'
			},
		}

		if (caps.presetThumbnails) {
			feedbacks.presetThumbnail = {
				type: 'advanced',
				name: 'Preset - Thumbnail',
				description: 'Provides the thumbnail of the selected preset as the button background image',
				options: optPreset(caps.preset),
				callback: (feedback) => {
					const idx = parsePresetIdx(feedback, caps.preset)
					if (idx === null) return {}
					return { png64: self.data.presetThumbnails[idx] }
				},
			}
		}
	}

	// ---- Exposure ----

	if (caps.filter) {
		feedbacks.filter = selectionFeedback(
			'Exposure - ND Filter',
			'Indicates if the selected ND filter is currently active',
			'Filter',
			caps.filter.dropdown,
			() => self.data.filter,
		)
	}

	if (caps.shutter) {
		feedbacks.shutter = selectionFeedback(
			'Exposure - Shutter',
			'Indicates if the selected shutter mode is currently active',
			'Mode',
			caps.shutter.dropdown,
			() => self.data.shutter,
		)
	}

	if (caps.night) {
		feedbacks.nightMode = stateFeedback(
			'Exposure - Night Mode',
			'Indicates if Night Mode is currently enabled',
			() => self.data.nightMode === '1',
		)
	}

	// ---- Image ----

	if (caps.gain) {
		feedbacks.gain = selectionFeedback(
			'Image - Gain',
			'Indicates if the selected gain mode is currently active',
			'Mode',
			caps.gain.dropdown,
			() => self.data.gain,
		)
	}

	if (caps.shootingMode) {
		feedbacks.shootingMode = selectionFeedback(
			'Image - Shooting Mode',
			'Indicates if the selected shooting mode is currently active',
			'Shooting Mode',
			caps.shootingMode.dropdown,
			() => self.data.shootingMode,
		)
	}

	if (caps.chromaLevel && caps.chromaLevel.dropdown) {
		feedbacks.chromaLevel = selectionFeedback(
			'Image - Chroma Level',
			'Indicates if the selected chroma level is currently active',
			'Level',
			caps.chromaLevel.dropdown,
			() => self.data.chromaLevel,
		)
	}

	if (caps.dnr && caps.dnr.dropdown) {
		feedbacks.dnr = selectionFeedback(
			'Image - Digital Noise Reduction',
			'Indicates if the selected digital noise reduction mode is currently active',
			'Mode',
			caps.dnr.dropdown,
			() => self.data.dnr,
		)
	}

	if (caps.drs && caps.drs.dropdown) {
		feedbacks.drs = selectionFeedback(
			'Image - Dynamic Range Stretch',
			'Indicates if the selected dynamic range stretch mode is currently active',
			'Mode',
			caps.drs.dropdown,
			() => self.data.drs,
		)
	}

	if (caps.whiteBalance && caps.whiteBalance.dropdown) {
		feedbacks.whiteBalance = selectionFeedback(
			'Image - White Balance',
			'Indicates if the selected white balance mode is currently active',
			'Mode',
			caps.whiteBalance.dropdown,
			() => self.data.whiteBalance,
		)
	}

	// ---- Recording and streaming ----

	if (caps.recordSD) {
		feedbacks.sdRecState = stateFeedback(
			'Recording - State',
			'Indicates if recording is currently in progress',
			() => self.data.recording === '1',
		)

		feedbacks.sdSlotState = stateFeedback(
			'Recording - SD card inserted',
			'Indicates if at least one SD card is inserted into a slot on the camera',
			() => self.data.sdInserted === '1' || self.data.sd2Inserted === '1',
			STYLE_GREEN,
		)
	}

	if (caps.streamRTMP) {
		feedbacks.streamStateRTMP = stateFeedback(
			'Streaming - RTMP Push State',
			'Indicates if streaming in RTMP Push mode is currently active',
			() => self.data.rtmp === '1',
		)
	}

	if (caps.streamSRT) {
		feedbacks.streamStateSRT = stateFeedback(
			'Streaming - SRT Caller State',
			'Indicates if streaming in SRT caller mode is currently active',
			() => self.data.srt === '1',
		)
	}

	if (caps.streamTS) {
		feedbacks.streamStateTS = stateFeedback(
			'Streaming - MPEG-TS Output State',
			'Indicates if streaming in MPEG-TS output mode is currently active',
			() => self.data.ts === '1',
		)
	}

	// ---- Audio ----

	if (caps.audioVolumeLevel) {
		const audio = caps.audioVolumeLevel
		// The levels the camera will actually take, which are the model's own range and step size.
		const levels = Array.from({ length: (audio.max - audio.min) / audio.step + 1 }, (_, i) => {
			const dB = audio.min + i * audio.step
			return { id: dB, label: `${dB} dB` }
		})

		feedbacks.audioVolumeLevel = selectionFeedback(
			'Audio - Volume Level',
			'Indicates if the audio volume level of the selected channel is at the configured one',
			'Volume Level (dB)',
			levels,
			(feedback) => self.data.audioVolumeLevels?.[feedback.options.channel],
			{
				// Every model's range straddles 0 dB on its own grid, so nominal is always a level it has.
				defaultIndex: levels.findIndex((level) => level.id === 0),
				options: [
					{
						type: 'dropdown',
						label: 'Audio Channel',
						id: 'channel',
						default: 0,
						choices: Array.from({ length: audio.maxch }, (_, i) => ({ id: i, label: `Channel ${i + 1}` })),
					},
				],
			},
		)
	}

	return feedbacks
}
