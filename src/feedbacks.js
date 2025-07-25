import { combineRgb } from '@companion-module/base'
import { getAndUpdateSeries } from './common.js'
import { e } from './enum.js'
import ICONS from './icons.js'

// ##########################
// #### Define Feedbacks ####
// ##########################
export function getFeedbackDefinitions(self) {
	const feedbacks = {}

	const SERIES = getAndUpdateSeries(self)

	const colorWhite = combineRgb(255, 255, 255)
	const colorRed = combineRgb(255, 0, 0)
	const colorGreen = combineRgb(0, 255, 0)
	const colorOrange = combineRgb(255, 102, 0)
	const colorBlue = combineRgb(0, 51, 204)
	const colorGrey = combineRgb(51, 51, 51)

	if (SERIES.capabilities.error) {
		feedbacks.error = {
			type: 'boolean',
			name: 'System - Error Condition',
			description: 'Indicates if an error condition currently exists',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.error !== '00'
			},
		}
	}

	if (SERIES.capabilities.power) {
		feedbacks.powerState = {
			type: 'boolean',
			name: 'System - Power State',
			description: 'Indicates if the camera is currently fully powered',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.power === '1'
			},
		}
	}

	if (SERIES.capabilities.colorbar) {
		feedbacks.colorbarState = {
			type: 'boolean',
			name: 'System - Color Bar State',
			description: 'Indicates if the color bar is currently enabled',
			defaultStyle: {
				png64: ICONS.COLORBAR,
				pngalignment: 'center:center',
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.colorbar === '1'
			},
		}
	}

	if (SERIES.capabilities.tally) {
		feedbacks.tallyState = {
			type: 'boolean',
			name: 'System - Red Tally State',
			description: 'Indicates if the red Tally is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.tally === '1'
			},
		}
	}

	if (SERIES.capabilities.tally2) {
		feedbacks.tally2State = {
			type: 'boolean',
			name: 'System - Green Tally State',
			description: 'Indicates if the green Tally is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorGreen,
			},
			options: [],
			callback: function () {
				return self.data.tally2 === '1'
			},
		}
	}

	if (SERIES.capabilities.tally3) {
		feedbacks.tally3State = {
			type: 'boolean',
			name: 'System - Yellow Tally State',
			description: 'Indicates if the yellow Tally is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorOrange,
			},
			options: [],
			callback: function () {
				return self.data.tally3 === '1'
			},
		}
	}

	if (SERIES.capabilities.install) {
		feedbacks.installState = {
			type: 'boolean',
			name: 'System - Install Position',
			description: 'Indicates if the selected mounting position is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Position',
					id: 'option',
					default: e.ENUM_INSTALL_POSITION[0].id,
					choices: e.ENUM_INSTALL_POSITION,
				},
			],
			callback: function (feedback) {
				return self.data.installMode === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.focusAuto) {
		feedbacks.focusMode = {
			type: 'boolean',
			name: 'Lens - Focus Mode Auto',
			description: 'Indicates if Auto Focus is currently enabled',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.focusMode === '1'
			},
		}
	}

	if (SERIES.capabilities.irisAuto) {
		feedbacks.irisMode = {
			type: 'boolean',
			name: 'Lens - Iris Mode Auto',
			description: 'Indicates if Auto Iris is currently enabled',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.irisMode === '1'
			},
		}
	}

	if (SERIES.capabilities.ois) {
		feedbacks.oisMode = {
			type: 'boolean',
			name: 'Lens - Image Stabilization',
			description: 'Indicates if the selected image stabilization mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'option',
					default: SERIES.capabilities.ois.dropdown[0].id,
					choices: SERIES.capabilities.ois.dropdown,
				},
			],
			callback: function (feedback) {
				return self.data.ois === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.zoom) {
		feedbacks.zoomControl = {
			type: 'boolean',
			name: 'Lens - Zoom Control',
			description: 'Indicates if Zoom is currently in operation',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.zoomSpeedValue != 0
			},
		}
	}

	if (SERIES.capabilities.trackingAuto) {
		feedbacks.autotrackingMode = {
			type: 'boolean',
			name: 'Auto Tracking - On/Off',
			description: 'Indicates if Auto Tracking is enabled',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.autotrackingMode === '1'
			},
		}

		feedbacks.autotrackingAngle = {
			type: 'boolean',
			name: 'Auto Tracking - Angle',
			description: 'Indicates if the selected angle is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'State',
					id: 'option',
					default: e.ENUM_AUTOTRACKING_ANGLE[2].id,
					choices: e.ENUM_AUTOTRACKING_ANGLE,
				},
			],
			callback: function (feedback) {
				return self.data.autotrackingAngle === feedback.options.option
			},
		}

		feedbacks.autotrackingStatus = {
			type: 'boolean',
			name: 'Auto Tracking - Status',
			description: 'Indicates if the selected status is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Status',
					id: 'option',
					default: e.ENUM_AUTOTRACKING_STATUS[1].id,
					choices: e.ENUM_AUTOTRACKING_STATUS,
				},
			],
			callback: function (feedback) {
				return self.data.autotrackingStatus === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.preset) {
		feedbacks.presetSpeedTime = {
			type: 'boolean',
			name: 'Preset - Recall Speed/Time',
			description: 'Indicates if the selected preset recall velocity is currently set',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Speed / Time',
					id: 'option',
					default: SERIES.capabilities.presetTime ? e.ENUM_PRESET_SPEED_TIME[0].id : e.ENUM_PRESET_SPEED[0].id,
					choices: SERIES.capabilities.presetTime ? e.ENUM_PRESET_SPEED_TIME : e.ENUM_PRESET_SPEED,
				},
			],
			callback: function (feedback) {
				return self.data.presetSpeed === feedback.options.option
			},
		}

		feedbacks.presetRecallScope = {
			type: 'boolean',
			name: 'Preset - Recall Scope',
			description: 'Indicates if the selected preset recall scope is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Scope',
					id: 'option',
					default: e.ENUM_PRESET_SCOPE[0].id,
					choices: e.ENUM_PRESET_SCOPE,
				},
			],
			callback: function (feedback) {
				return self.data.presetScope === feedback.options.option
			},
		}

		feedbacks.presetSelected = {
			type: 'boolean',
			name: 'Preset - Selected / Active',
			description: 'Indicates if the selected preset is currently active (last selected)',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorOrange,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Preset',
					id: 'option',
					default: e.ENUM_PRESET[0].id,
					choices: e.ENUM_PRESET,
				},
			],
			callback: function (feedback) {
				return (
					self.data.presetEntries[parseInt(feedback.options.option)] === '1' &&
					self.data.presetSelectedIdx === parseInt(feedback.options.option)
				)
			},
		}

		feedbacks.presetComplete = {
			type: 'boolean',
			name: 'Preset - Recall Completion Notification',
			description: 'Indicates if the last recall to the selected preset is completed',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorBlue,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Preset',
					id: 'option',
					default: e.ENUM_PRESET[0].id,
					choices: e.ENUM_PRESET,
				},
			],
			callback: function (feedback) {
				return (
					self.data.presetEntries[parseInt(feedback.options.option)] === '1' &&
					self.data.presetCompletedIdx === parseInt(feedback.options.option)
				)
			},
		}

		feedbacks.presetMemory = {
			type: 'boolean',
			name: 'Preset - Memory State',
			description: 'Indicates if the selected preset memory is in use',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorGrey,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Preset',
					id: 'option',
					default: e.ENUM_PRESET[0].id,
					choices: e.ENUM_PRESET,
				},
			],
			callback: function (feedback) {
				return self.data.presetEntries[parseInt(feedback.options.option)] === '1'
			},
		}

		if (SERIES.capabilities.presetThumbnails) {
			feedbacks.presetThumbnail = {
				type: 'advanced',
				name: 'Preset - Thumbnail',
				description: 'Provides the thumbnail of the selected preset as the button background image',
				options: [
					{
						type: 'dropdown',
						label: 'Preset',
						id: 'option',
						default: e.ENUM_PRESET[0].id,
						choices: e.ENUM_PRESET,
					},
				],
				callback: function (feedback) {
					const id = parseInt(feedback.options.option)
					return { png64: self.data.presetThumbnails[id] }
				},
			}
		}
	}

	if (SERIES.capabilities.filter) {
		feedbacks.filter = {
			type: 'boolean',
			name: 'Exposure - ND Filter',
			description: 'Indicates if the selected ND filter is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Filter',
					id: 'option',
					default: SERIES.capabilities.filter.dropdown[0].id,
					choices: SERIES.capabilities.filter.dropdown,
				},
			],
			callback: function (feedback) {
				return self.data.filter === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.shutter) {
		feedbacks.shutter = {
			type: 'boolean',
			name: 'Exposure - Shutter',
			description: 'Indicates if the selected shutter mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'option',
					default: SERIES.capabilities.shutter.dropdown[0].id,
					choices: SERIES.capabilities.shutter.dropdown,
				},
			],
			callback: function (feedback) {
				return self.data.shutter === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.night) {
		feedbacks.nightMode = {
			type: 'boolean',
			name: 'Exposure - Night Mode',
			description: 'Indicates if Night Mode is currently enabled',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.nightMode === '1'
			},
		}
	}

	if (SERIES.capabilities.gain) {
		feedbacks.gain = {
			type: 'boolean',
			name: 'Image - Gain',
			description: 'Indicates if the selected gain mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'option',
					default: SERIES.capabilities.gain.dropdown[0].id,
					choices: SERIES.capabilities.gain.dropdown,
				},
			],
			callback: function (feedback) {
				return self.data.gain === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.whiteBalance && SERIES.capabilities.whiteBalance.dropdown) {
		feedbacks.whiteBalance = {
			type: 'boolean',
			name: 'Image - White Balance',
			description: 'Indicates if the selected white balance mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [
				{
					type: 'dropdown',
					label: 'Mode',
					id: 'option',
					default: SERIES.capabilities.whiteBalance.dropdown[0].id,
					choices: SERIES.capabilities.whiteBalance.dropdown,
				},
			],
			callback: function (feedback) {
				return self.data.whiteBalance === feedback.options.option
			},
		}
	}

	if (SERIES.capabilities.recordSD) {
		feedbacks.sdRecState = {
			type: 'boolean',
			name: 'Recording - State',
			description: 'Indicates if recording is currently in progress',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.recording === '1'
			},
		}
	}

	if (SERIES.capabilities.recordSD) {
		feedbacks.sdSlotState = {
			type: 'boolean',
			name: 'Recording - SD card inserted',
			description: 'Indicates if at least one SD card is inserted into a slot on the camera',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorGreen,
			},
			options: [],
			callback: function () {
				return self.data.sdInserted === '1' || self.data.sd2Inserted === '1'
			},
		}
	}

	if (SERIES.capabilities.streamRTMP) {
		feedbacks.streamStateRTMP = {
			type: 'boolean',
			name: 'Streaming - RTMP Push State',
			description: 'Indicates if streaming in RTMP Push mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.rtmp === '1'
			},
		}
	}

	if (SERIES.capabilities.streamSRT) {
		feedbacks.streamStateSRT = {
			type: 'boolean',
			name: 'Streaming - SRT Caller State',
			description: 'Indicates if streaming in SRT caller mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.srt === '1'
			},
		}
	}

	if (SERIES.capabilities.streamTS) {
		feedbacks.streamStateTS = {
			type: 'boolean',
			name: 'Streaming - MPEG-TS Output State',
			description: 'Indicates if streaming in MPEG-TS output mode is currently active',
			defaultStyle: {
				color: colorWhite,
				bgcolor: colorRed,
			},
			options: [],
			callback: function () {
				return self.data.ts === '1'
			},
		}
	}

	return feedbacks
}
