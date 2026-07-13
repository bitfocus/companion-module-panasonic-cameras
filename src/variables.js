import { constrainRange, getAndUpdateSeries, getLabel } from './common.js'
import { e } from './enum.js'

// ##########################
// #### Define Variables ####
// ##########################
export function setVariables(self) {
	const SERIES = getAndUpdateSeries(self)
	const caps = SERIES.capabilities

	// Which variables a camera exposes follows directly from what it can do. Each row is
	// [what the camera must support, the variables that unlocks]. The guard is a capability key,
	// or a predicate where the condition is more than "the camera has this at all".
	const VARIABLES = [
		[null, { model: 'Model of camera', title: 'Title of camera' }],
		['version', { version: 'Firmware Version' }],
		['error', { error: 'Error Code' }],
		['install', { installMode: 'Install Position' }],
		['power', { power: 'Power Status' }],
		['colorbar', { colorbar: 'Color Bar Status' }],
		['tally', { tally: 'Red Tally Status' }],
		[(c) => c.tally && c.tally2, { tally2: 'Green Tally Status' }],
		[(c) => c.tally && c.tally2 && c.tally3, { tally3: 'Yellow Tally Status' }],
		['focusAuto', { focusMode: 'Focus Mode' }],
		[(c) => c.whiteBalance && c.whiteBalance.dropdown, { whiteBalance: 'White Balance Mode' }],
		['colorTemperature', { colorTemperature: 'Color Temperature' }],
		['filter', { filter: 'ND Filter' }],
		['gain', { gain: 'Gain' }],
		['shootingMode', { shootingMode: 'Shooting Mode' }],
		['night', { nightMode: 'Night Mode' }],
		[
			'preset',
			{
				presetScope: 'Preset Recall Scope',
				presetCompleted: 'Preset # Completed',
				presetSelected: 'Preset # Selected',
				presetMemory: 'Used Preset Memory slots',
			},
		],
		['shutter', { shutter: 'Shutter Mode' }],
		[(c) => c.shutter && c.shutter.dropdown === e.ENUM_SHUTTER_ADV, { shutterStep: 'Shutter Step' }],
		['ois', { ois: 'O.I.S.' }],
		[
			'panTilt',
			{
				ptSpeed: 'Pan/Tilt Speed',
				pSpeed: 'Pan Speed',
				tSpeed: 'Tilt Speed',
				panPosition: 'Pan Position',
				tiltPosition: 'Tilt Position',
				panPositionDeg: 'Pan Position °',
				tiltPositionDeg: 'Tilt Position °',
			},
		],
		[
			'zoom',
			{
				zoomPosition: 'Zoom Position',
				zoomPositionPct: 'Zoom Position %',
				zoomPositionBar: 'Zoom Position',
				zoomSpeed: 'Zoom Speed Control',
				zSpeed: 'Zoom Speed',
			},
		],
		[
			'focus',
			{
				focusPosition: 'Focus Position',
				focusPositionPct: 'Focus Position %',
				focusPositionBar: 'Focus Position',
				focusSpeed: 'Focus Speed Control',
				fSpeed: 'Focus Speed',
			},
		],
		[
			'iris',
			{
				irisPosition: 'Iris Position',
				irisPositionPct: 'Iris Position %',
				irisPositionBar: 'Iris Position',
				irisVolume: 'Iris Volume',
			},
		],
		['irisAuto', { irisMode: 'Iris Mode' }],
		['irisF', { irisF: 'Iris F No.' }],
		['pedestal', { masterPed: 'Master Pedestal' }],
		['chromaLevel', { chromaLevel: 'Chroma Level' }],
		['chromaPhase', { chromaPhase: 'Chroma Phase' }],
		['dnr', { dnr: 'Digital Noise Reduction' }],
		['drs', { drs: 'Dynamic Range Stretch' }],
		['colorGain', { redGain: 'Red Gain', blueGain: 'Blue Gain' }],
		[(c) => c.colorGain && c.colorGain.cmd.green, { greenGain: 'Green Gain' }],
		['colorPedestal', { redPed: 'Red Pedestal', bluePed: 'Blue Pedestal' }],
		[(c) => c.colorPedestal && c.colorPedestal.cmd.green, { greenPed: 'Green Pedestal' }],
		['presetSpeed', { presetSpeed: 'Preset Recall Speed/Time', presetSpeedTable: 'Preset Recall Speed Table' }],
		['presetTime', { presetSpeedUnit: 'Preset Recall Speed Unit' }],
		['recordSD', { recording: 'SD Card Recording Status' }],
		['streamRTMP', { streamingRTMP: 'RTMP Push Status' }],
		['streamSRT', { streamingSRT: 'SRT Caller Status' }],
		['streamTS', { streamingTS: 'MPEG-TS Output Status' }],
		['videoFormat', { videoFormat: 'Video Format' }],
		[
			'trackingAuto',
			{
				autotrackingMode: 'Autotracking Mode',
				autotrackingAngle: 'Autotracking Angle',
				autotrackingStatus: 'Autotracking Status',
			},
		],
	]

	const variables = {}

	for (const [guard, names] of VARIABLES) {
		const supported = guard === null || (typeof guard === 'function' ? guard(caps) : caps[guard])
		if (!supported) continue
		for (const [id, name] of Object.entries(names)) variables[id] = { name }
	}

	// One per audio channel the camera actually has.
	if (caps.audioVolumeLevel) {
		for (let ch = 1; ch <= caps.audioVolumeLevel.maxch; ch++) {
			variables[`audioVolumeLevel${ch}`] = { name: `Audio Volume Level Channel ${ch} (dB)` }
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
