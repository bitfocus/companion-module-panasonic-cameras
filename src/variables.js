import { constrainRange, getAndUpdateSeries, getLabel } from './common.js'
import { e } from './enum.js'

// ##########################
// #### Define Variables ####
// ##########################
export function setVariables(self) {
	const SERIES = getAndUpdateSeries(self)

	const variables = {}

	variables.model = { name: 'Model of camera' }
	variables.title = { name: 'Title of camera' }
	if (SERIES.capabilities.version) {
		variables.version = { name: 'Firmware Version' }
	}
	if (SERIES.capabilities.error) {
		variables.error = { name: 'Error Code' }
	}
	if (SERIES.capabilities.install) {
		variables.installMode = { name: 'Install Position' }
	}
	if (SERIES.capabilities.power) {
		variables.power = { name: 'Power Status' }
	}
	if (SERIES.capabilities.colorbar) {
		variables.colorbar = { name: 'Color Bar Status' }
	}
	if (SERIES.capabilities.tally) {
		variables.tally = { name: 'Red Tally Status' }
		if (SERIES.capabilities.tally2) {
			variables.tally2 = { name: 'Green Tally Status' }
			if (SERIES.capabilities.tally3) {
				variables.tally3 = { name: 'Yellow Tally Status' }
			}
		}
	}
	if (SERIES.capabilities.focusAuto) {
		variables.focusMode = { name: 'Focus Mode' }
	}
	if (SERIES.capabilities.whiteBalance && SERIES.capabilities.whiteBalance.dropdown) {
		variables.whiteBalance = { name: 'White Balance Mode' }
	}
	if (SERIES.capabilities.colorTemperature) {
		variables.colorTemperature = { name: 'Color Temperature' }
	}
	if (SERIES.capabilities.filter) {
		variables.filter = { name: 'ND Filter' }
	}
	if (SERIES.capabilities.gain) {
		variables.gain = { name: 'Gain' }
	}
	if (SERIES.capabilities.shootingMode) {
		variables.shootingMode = { name: 'Shooting Mode' }
	}
	if (SERIES.capabilities.night) {
		variables.nightMode = { name: 'Night Mode' }
	}
	if (SERIES.capabilities.preset) {
		variables.presetScope = { name: 'Preset Recall Scope' }
		variables.presetCompleted = { name: 'Preset # Completed' }
		variables.presetSelected = { name: 'Preset # Selected' }
		variables.presetMemory = { name: 'Used Preset Memory slots' }
	}
	if (SERIES.capabilities.shutter) {
		variables.shutter = { name: 'Shutter Mode' }
	}
	if (SERIES.capabilities.shutter && SERIES.capabilities.shutter.dropdown === e.ENUM_SHUTTER_ADV) {
		variables.shutterStep = { name: 'Shutter Step' }
	}
	if (SERIES.capabilities.ois) {
		variables.ois = { name: 'O.I.S.' }
	}
	if (SERIES.capabilities.panTilt) {
		variables.ptSpeed = { name: 'Pan/Tilt Speed' }
		variables.pSpeed = { name: 'Pan Speed' }
		variables.tSpeed = { name: 'Tilt Speed' }
		variables.panPosition = { name: 'Pan Position' }
		variables.tiltPosition = { name: 'Tilt Position' }
		variables.panPositionDeg = { name: 'Pan Position °' }
		variables.tiltPositionDeg = { name: 'Tilt Position °' }
	}
	if (SERIES.capabilities.zoom) {
		variables.zoomPosition = { name: 'Zoom Position' }
		variables.zoomPositionPct = { name: 'Zoom Position %' }
		variables.zoomPositionBar = { name: 'Zoom Position' }
		variables.zoomSpeed = { name: 'Zoom Speed Control' }
		variables.zSpeed = { name: 'Zoom Speed' }
	}
	if (SERIES.capabilities.focus) {
		variables.focusPosition = { name: 'Focus Position' }
		variables.focusPositionPct = { name: 'Focus Position %' }
		variables.focusPositionBar = { name: 'Focus Position' }
		variables.focusSpeed = { name: 'Focus Speed Control' }
		variables.fSpeed = { name: 'Focus Speed' }
	}
	if (SERIES.capabilities.iris) {
		variables.irisPosition = { name: 'Iris Position' }
		variables.irisPositionPct = { name: 'Iris Position %' }
		variables.irisPositionBar = { name: 'Iris Position' }
		variables.irisVolume = { name: 'Iris Volume' }
	}
	if (SERIES.capabilities.irisAuto) {
		variables.irisMode = { name: 'Iris Mode' }
	}
	if (SERIES.capabilities.irisF) {
		variables.irisF = { name: 'Iris F No.' }
	}
	if (SERIES.capabilities.pedestal) {
		variables.masterPed = { name: 'Master Pedestal' }
	}
	if (SERIES.capabilities.chromaLevel) {
		variables.chromaLevel = { name: 'Chroma Level' }
	}
	if (SERIES.capabilities.chromaPhase) {
		variables.chromaPhase = { name: 'Chroma Phase' }
	}
	if (SERIES.capabilities.dnr) {
		variables.dnr = { name: 'Digital Noise Reduction' }
	}
	if (SERIES.capabilities.drs) {
		variables.drs = { name: 'Dynamic Range Stretch' }
	}
	if (SERIES.capabilities.colorGain) {
		variables.redGain = { name: 'Red Gain' }
		variables.blueGain = { name: 'Blue Gain' }
		if (SERIES.capabilities.colorGain.cmd.green) {
			variables.greenGain = { name: 'Green Gain' }
		}
	}
	if (SERIES.capabilities.colorPedestal) {
		variables.redPed = { name: 'Red Pedestal' }
		variables.bluePed = { name: 'Blue Pedestal' }
		if (SERIES.capabilities.colorPedestal.cmd.green) {
			variables.greenPed = { name: 'Green Pedestal' }
		}
	}
	if (SERIES.capabilities.presetSpeed) {
		variables.presetSpeed = { name: 'Preset Recall Speed/Time' }
		variables.presetSpeedTable = { name: 'Preset Recall Speed Table' }
	}
	if (SERIES.capabilities.presetTime) {
		variables.presetSpeedUnit = { name: 'Preset Recall Speed Unit' }
	}
	if (SERIES.capabilities.recordSD) {
		variables.recording = { name: 'SD Card Recording Status' }
	}
	if (SERIES.capabilities.streamRTMP) {
		variables.streamingRTMP = { name: 'RTMP Push Status' }
	}
	if (SERIES.capabilities.streamSRT) {
		variables.streamingSRT = { name: 'SRT Caller Status' }
	}
	if (SERIES.capabilities.streamTS) {
		variables.streamingTS = { name: 'MPEG-TS Output Status' }
	}
	if (SERIES.capabilities.videoFormat) {
		variables.videoFormat = { name: 'Video Format' }
	}
	if (SERIES.capabilities.trackingAuto) {
		variables.autotrackingMode = { name: 'Autotracking Mode' }
		variables.autotrackingAngle = { name: 'Autotracking Angle' }
		variables.autotrackingStatus = { name: 'Autotracking Status' }
	}
	if (SERIES.capabilities.audioVolumeLevel) {
		for (let ch = 0; ch < SERIES.capabilities.audioVolumeLevel.maxch; ch++) {
			variables[`audioVolumeLevel${ch + 1}`] = { name: `Audio Volume Level Channel ${ch + 1} (dB)` }
		}
	}

	return variables
}

// #########################
// #### Check Variables ####
// #########################
export function checkVariables(self) {
	const SERIES = getAndUpdateSeries(self)

	// Each of these is the same rule: if the camera has the feature, turn its raw value into the
	// human-readable label from the matching dropdown. The dropdown is either a fixed enum or one
	// that the capability itself carries.
	// [variable, capability, choices (or how to get them from the capability), data key if it differs]
	const LABELLED = [
		['autotrackingAngle', 'trackingAuto', e.ENUM_AUTOTRACKING_ANGLE],
		['autotrackingMode', 'trackingAuto', e.ENUM_OFF_ON],
		['autotrackingStatus', 'trackingAuto', e.ENUM_AUTOTRACKING_STATUS],
		['chromaLevel', 'chromaLevel', (cap) => cap.dropdown],
		['colorbar', 'colorbar', e.ENUM_OFF_ON],
		['colorTemperature', 'colorTemperature', (cap) => cap.index?.dropdown],
		['dnr', 'dnr', (cap) => cap.dropdown],
		['drs', 'drs', (cap) => cap.dropdown],
		['error', 'error', e.ENUM_ERROR],
		['filter', 'filter', (cap) => cap.dropdown],
		['focusMode', 'focusAuto', e.ENUM_MAN_AUTO],
		['gain', 'gain', (cap) => cap.dropdown],
		['installMode', 'install', e.ENUM_INSTALL_POSITION],
		['irisMode', 'irisAuto', e.ENUM_MAN_AUTO],
		['nightMode', 'night', e.ENUM_OFF_ON],
		['ois', 'ois', (cap) => cap.dropdown],
		['power', 'power', e.ENUM_OFF_ON],
		['presetScope', 'preset', e.ENUM_PRESET_SCOPE],
		['presetSpeed', 'presetSpeed', e.ENUM_PRESET_SPEED_TIME],
		['presetSpeedTable', 'presetSpeed', (cap) => cap.dropdown],
		['presetSpeedUnit', 'presetTime', e.ENUM_PRESET_SPEED_UNIT],
		['recording', 'recordSD', e.ENUM_OFF_ON],
		['shootingMode', 'shootingMode', (cap) => cap.dropdown],
		['shutter', 'shutter', (cap) => cap.dropdown],
		['streamingRTMP', 'streamRTMP', e.ENUM_OFF_ON, 'rtmp'],
		['streamingSRT', 'streamSRT', e.ENUM_OFF_ON, 'srt'],
		['streamingTS', 'streamTS', e.ENUM_OFF_ON, 'ts'],
		['tally', 'tally', e.ENUM_OFF_ON],
		['tally2', 'tally2', e.ENUM_OFF_ON],
		['tally3', 'tally3', e.ENUM_OFF_ON],
		['videoFormat', 'videoFormat', e.ENUM_VIDEO_FORMAT],
		['whiteBalance', 'whiteBalance', (cap) => cap.dropdown],
	]

	const labelled = {}
	for (const [variable, capability, choices, dataKey = variable] of LABELLED) {
		const cap = SERIES.capabilities[capability]
		const dropdown = typeof choices === 'function' ? (cap ? choices(cap) : undefined) : choices
		labelled[variable] = cap && dropdown ? getLabel(dropdown, self.data[dataKey]) : null
	}

	const presetMemory = SERIES.capabilities.preset
		? self.data.presetEntries
				.map((p, i) => (p === '1' ? i + 1 : null))
				.filter((n) => n !== null)
				.join(',')
		: null

	const progressBar = (pct, width = 20, start = '', end = '') => {
		if (pct && pct >= 0 && pct <= 100) {
			const flr = Math.floor((pct * width) / 100)
			return start + '.'.repeat(flr) + '|' + '.'.repeat(width - flr) + end
			//return start + ("|").repeat(flr).padEnd(width, ".") + end
		}
		return '---'
	}

	const normalizePct = (val, low = 0, high = 100, limit = false, fractionDigits = 0) => {
		val = limit ? constrainRange(val, low, high) : val
		return val < low || val > high ? null : (((val - low) / (high - low)) * 100).toFixed(fractionDigits)
	}

	self.setVariableValues({
		model: self.data.model,
		title: self.data.title,
		version: self.data.version,

		presetSelected: self.data.presetSelectedIdx !== null ? (self.data.presetSelectedIdx + 1).toString() : null,
		presetCompleted: self.data.presetCompletedIdx !== null ? (self.data.presetCompletedIdx + 1).toString() : null,
		presetMemory: presetMemory,

		panPosition: self.data.panPosition,
		tiltPosition: self.data.tiltPosition,
		panPositionDeg: (-self.data.panPosition * (29.7 / 3600)).toFixed(1),
		tiltPositionDeg: (-self.data.tiltPosition * (29.7 / 3600)).toFixed(1),
		focusPosition: self.data.focusPosition,
		irisPosition: self.data.irisPosition,
		zoomPosition: self.data.zoomPosition,
		focusPositionPct: normalizePct(self.data.focusPosition, 0x0, 0xaaa, false),
		irisPositionPct: normalizePct(self.data.irisPosition, 0x0, 0xaaa, false),
		zoomPositionPct: normalizePct(self.data.zoomPosition, 0x0, 0xaaa, false, 1),
		zoomPositionBar: progressBar(normalizePct(self.data.zoomPosition, 0x0, 0xaaa), 10, 'W', 'T'),
		focusPositionBar: progressBar(normalizePct(self.data.focusPosition, 0x0, 0xaaa), 10, 'N', 'F'),
		irisPositionBar: progressBar(normalizePct(self.data.irisPosition, 0x0, 0xaaa), 10, 'C', 'O'),

		irisVolume: self.data.irisVolume,

		chromaPhase: self.data.chromaPhaseValue,
		focusSpeed: self.data.focusSpeedValue,
		redGain: self.data.redGainValue,
		blueGain: self.data.blueGainValue,
		greenGain: self.data.greenGainValue,
		redPed: self.data.redPedValue,
		bluePed: self.data.bluePedValue,
		greenPed: self.data.greenPedValue,
		masterPed: self.data.masterPedValue,
		zoomSpeed: self.data.zoomSpeedValue,

		irisF: self.data.irisLabel,
		shutterStep: self.data.shutterStepLabel,

		...labelled,

		// Cameras that report a temperature directly take precedence over the indexed dropdown.
		colorTemperature: self.data.colorTempLabel ? self.data.colorTempLabel : labelled.colorTemperature,

		ptSpeed: self.ptSpeed,
		pSpeed: self.pSpeed,
		tSpeed: self.tSpeed,
		zSpeed: self.zSpeed,
		fSpeed: self.fSpeed,
	})

	// Set Audio Volume Level variables
	if (SERIES.capabilities.audioVolumeLevel && self.data.audioVolumeLevels) {
		const audioVars = {}
		for (let ch = 0; ch < SERIES.capabilities.audioVolumeLevel.maxch; ch++) {
			audioVars[`audioVolumeLevel${ch + 1}`] =
				self.data.audioVolumeLevels[ch] !== undefined ? `${self.data.audioVolumeLevels[ch]}dB` : null
		}
		self.setVariableValues(audioVars)
	}
}
