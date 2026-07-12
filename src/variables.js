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

	const autotrackingAngle = SERIES.capabilities.trackingAuto ? getLabel(e.ENUM_AUTOTRACKING_ANGLE, self.data.autotrackingAngle) : null

	const autotrackingMode = SERIES.capabilities.trackingAuto ? getLabel(e.ENUM_OFF_ON, self.data.autotrackingMode) : null

	const autotrackingStatus = SERIES.capabilities.trackingAuto ? getLabel(e.ENUM_AUTOTRACKING_STATUS, self.data.autotrackingStatus) : null

	const chromaLevel = SERIES.capabilities.chromaLevel ? getLabel(SERIES.capabilities.chromaLevel.dropdown, self.data.chromaLevel) : null

	const colorbar = SERIES.capabilities.colorbar ? getLabel(e.ENUM_OFF_ON, self.data.colorbar) : null

	const dnr = SERIES.capabilities.dnr ? getLabel(SERIES.capabilities.dnr.dropdown, self.data.dnr) : null

	const drs = SERIES.capabilities.drs ? getLabel(SERIES.capabilities.drs.dropdown, self.data.drs) : null

	const videoFormat = SERIES.capabilities.videoFormat ? getLabel(e.ENUM_VIDEO_FORMAT, self.data.videoFormat) : null

	const colorTemperature = SERIES.capabilities.colorTemperature.index ? getLabel(SERIES.capabilities.colorTemperature.index.dropdown, self.data.colorTemperature) : null

	const error = SERIES.capabilities.error ? getLabel(e.ENUM_ERROR, self.data.error) : null

	const filter = SERIES.capabilities.filter ? getLabel(SERIES.capabilities.filter.dropdown, self.data.filter) : null

	const focusMode = SERIES.capabilities.focusAuto ? getLabel(e.ENUM_MAN_AUTO, self.data.focusMode) : null

	const gain = SERIES.capabilities.gain ? getLabel(SERIES.capabilities.gain.dropdown, self.data.gain) : null

	const installMode = SERIES.capabilities.install ? getLabel(e.ENUM_INSTALL_POSITION, self.data.installMode) : null

	const irisMode = SERIES.capabilities.irisAuto ? getLabel(e.ENUM_MAN_AUTO, self.data.irisMode) : null

	const nightMode = SERIES.capabilities.night ? getLabel(e.ENUM_OFF_ON, self.data.nightMode) : null

	const ois = SERIES.capabilities.ois ? getLabel(SERIES.capabilities.ois.dropdown, self.data.ois) : null

	const power = SERIES.capabilities.power ? getLabel(e.ENUM_OFF_ON, self.data.power) : null

	const presetScope = SERIES.capabilities.preset ? getLabel(e.ENUM_PRESET_SCOPE, self.data.presetScope) : null

	const presetMemory = SERIES.capabilities.preset
		? self.data.presetEntries
				.map((p, i) => (p === '1' ? i + 1 : null))
				.filter((n) => n !== null)
				.join(',')
		: null

	const presetSpeed = SERIES.capabilities.presetSpeed ? getLabel(e.ENUM_PRESET_SPEED_TIME, self.data.presetSpeed) : null

	const presetSpeedTable = SERIES.capabilities.presetSpeed ? getLabel(SERIES.capabilities.presetSpeed.dropdown, self.data.presetSpeedTable) : null

	const presetSpeedUnit = SERIES.capabilities.presetTime ? getLabel(e.ENUM_PRESET_SPEED_UNIT, self.data.presetSpeedUnit) : null

	const recording = SERIES.capabilities.recordSD ? getLabel(e.ENUM_OFF_ON, self.data.recording) : null

	const rtmp = SERIES.capabilities.streamRTMP ? getLabel(e.ENUM_OFF_ON, self.data.rtmp) : null

	const shootingMode = SERIES.capabilities.shootingMode ? getLabel(SERIES.capabilities.shootingMode.dropdown, self.data.shootingMode) : null

	const shutter = SERIES.capabilities.shutter ? getLabel(SERIES.capabilities.shutter.dropdown, self.data.shutter) : null

	const srt = SERIES.capabilities.streamSRT ? getLabel(e.ENUM_OFF_ON, self.data.srt) : null

	const tally = SERIES.capabilities.tally ? getLabel(e.ENUM_OFF_ON, self.data.tally) : null

	const tally2 = SERIES.capabilities.tally2 ? getLabel(e.ENUM_OFF_ON, self.data.tally2) : null

	const tally3 = SERIES.capabilities.tally3 ? getLabel(e.ENUM_OFF_ON, self.data.tally3) : null

	const ts = SERIES.capabilities.streamTS ? getLabel(e.ENUM_OFF_ON, self.data.ts) : null

	const whiteBalance = SERIES.capabilities.whiteBalance && SERIES.capabilities.whiteBalance.dropdown ? getLabel(SERIES.capabilities.whiteBalance.dropdown, self.data.whiteBalance) : null

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

		colorTemperature: self.data.colorTempLabel ? self.data.colorTempLabel : colorTemperature,

		autotrackingAngle: autotrackingAngle,
		autotrackingMode: autotrackingMode,
		autotrackingStatus: autotrackingStatus,
		chromaLevel: chromaLevel,
		colorbar: colorbar,
		dnr: dnr,
		drs: drs,
		error: error,
		filter: filter,
		focusMode: focusMode,
		gain: gain,
		installMode: installMode,
		irisMode: irisMode,
		nightMode: nightMode,
		ois: ois,
		power: power,
		presetScope: presetScope,
		presetSpeed: presetSpeed,
		presetSpeedTable: presetSpeedTable,
		presetSpeedUnit: presetSpeedUnit,
		shootingMode: shootingMode,
		shutter: shutter,
		streamingSRT: srt,
		streamingTS: ts,
		streamingRTMP: rtmp,
		tally: tally,
		tally2: tally2,
		tally3: tally3,
		recording: recording,
		videoFormat: videoFormat,
		whiteBalance: whiteBalance,

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
			audioVars[`audioVolumeLevel${ch + 1}`] = self.data.audioVolumeLevels[ch] !== undefined ? `${self.data.audioVolumeLevels[ch]}dB` : null
		}
		self.setVariableValues(audioVars)
	}
}
