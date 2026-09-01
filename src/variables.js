import { constrainRange, seriesOf, getLabel } from './common.js'
import { e } from './enum.js'

export function setVariables(self) {
	const SERIES = seriesOf(self)
	const caps = SERIES.capabilities

	// [capability guard, variables it unlocks]. Guard is a capability key or a predicate.
	const VARIABLES = [
		[null, { model: 'Model of camera', title: 'Title of camera', customResponse: 'Last Custom Command Response' }],
		['version', { version: 'Firmware Version' }],
		['error', { error: 'Error Code' }],
		['errorCamera', { errorCamera: 'Camera Error' }],
		['install', { installMode: 'Install Position' }],
		['power', { power: 'Power Status' }],
		['colorbar', { colorbar: 'Color Bar Status' }],
		['tally', { tally: 'Red Tally Status' }],
		[(c) => c.tally && c.tally2, { tally2: 'Green Tally Status' }],
		[(c) => c.tally && c.tally2 && c.tally3, { tally3: 'Yellow Tally Status' }],
		['focusAuto', { focusMode: 'Focus Mode' }],
		[(c) => c.whiteBalance && c.whiteBalance.dropdown, { whiteBalance: 'White Balance Mode' }],
		['whiteBalance', { awbResult: 'AWC/AWB Result' }],
		['blackBalance', { abbResult: 'ABC/ABB Result' }],
		['colorTemperature', { colorTemperature: 'Color Temperature' }],
		['awbColorTemperature', { awbColorTemperature: 'AWB Color Temperature' }],
		['filter', { filter: 'ND Filter' }],
		['filterFollow', { filterFollow: 'ND Filter Follow' }],
		['gain', { gain: 'Gain' }],
		['shootingMode', { shootingMode: 'Shooting Mode' }],
		['night', { nightMode: 'Night Mode' }],
		[
			'preset',
			{
				presetCompleted: 'Preset # Completed',
				presetSelected: 'Preset # Selected',
				presetMemory: 'Used Preset Memory slots',
			},
		],
		[(c) => c.preset && c.presetScope, { presetScope: 'Preset Recall Scope' }],
		['shutter', { shutter: 'Shutter Mode' }],
		[(c) => c.shutter && c.shutter.cmd === 'OSJ:03', { shutterStep: 'Shutter Step' }],
		['ois', { ois: 'O.I.S.' }],
		[
			'panTilt',
			{
				ptSpeed: 'Pan/Tilt Speed',
				pSpeed: 'Pan Speed',
				tSpeed: 'Tilt Speed',
			},
		],
		[
			'panTiltPosition',
			{
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
			},
		],
		[
			'panTiltLimit',
			{
				limitUp: 'Tilt Up Limit',
				limitDown: 'Tilt Down Limit',
				limitLeft: 'Pan Left Limit',
				limitRight: 'Pan Right Limit',
			},
		],
		['irisAuto', { irisMode: 'Iris Mode' }],
		['irisF', { irisF: 'Iris F No.' }],
		[
			'irisFollowPosition',
			{
				irisFollowPosition: 'Iris Follow',
				irisFollowPositionPct: 'Iris Follow %',
				irisFollowPositionBar: 'Iris Follow',
			},
		],
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

	if (caps.audioVolumeLevel) {
		for (let ch = 1; ch <= caps.audioVolumeLevel.maxch; ch++) {
			variables[`audioVolumeLevel${ch}`] = { name: `Audio Volume Level Channel ${ch} (dB)` }
		}
	}

	// if (caps.presetNames && caps.preset) {
	// 	for (let n = 1; n <= caps.preset; n++) {
	// 		variables[`presetName${n}`] = { name: `Preset ${n} Name` }
	// 	}
	// }

	return variables
}

export function checkVariables(self) {
	const SERIES = seriesOf(self)

	// [variable, capability, choices or fn(capability), data key if it differs]
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
		['filterFollow', 'filterFollow', (cap) => cap.dropdown],
		['focusMode', 'focusAuto', e.ENUM_MAN_AUTO],
		['gain', 'gain', (cap) => cap.dropdown],
		['installMode', 'install', e.ENUM_INSTALL_POSITION],
		['irisMode', 'irisAuto', e.ENUM_MAN_AUTO],
		['nightMode', 'night', e.ENUM_OFF_ON],
		['ois', 'ois', (cap) => cap.dropdown],
		['power', 'power', e.ENUM_OFF_ON],
		['presetScope', 'presetScope', e.ENUM_PRESET_SCOPE],
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

	const irisMax = SERIES.capabilities.iris?.max ?? 0xaaa

	// The camera's fault state is a bitmask, not one of the id/label tables the other enums use: several
	// faults can stand at once. Empty string rather than "No Error", so a button can carry it bare and
	// stay blank while all is well. A bit above the model's own list is dropped, not rendered undefined.
	const errorBits = SERIES.capabilities.errorCamera?.bits ?? []
	const errorCameraValue =
		SERIES.capabilities.errorCamera?.cmd === 'QER' ? self.data.errorCamera : self.data.errorCameraDetail

	self.setVariableValues({
		errorCamera:
			errorCameraValue === null || errorCameraValue === undefined
				? null
				: errorBits.filter((_, i) => errorCameraValue & (1 << i)).join(', '),

		awbResult: self.data.awbResult,
		abbResult: self.data.abbResult,

		customResponse: self.data.customResponse,
		// null, not undefined, for a direction the camera has not reported: setVariableValues treats an
		// undefined value as "leave as it was", which would keep a stale label after a reconnect.
		...Object.fromEntries(
			['limitUp', 'limitDown', 'limitLeft', 'limitRight'].map((name, i) => [
				name,
				getLabel(e.ENUM_OFF_ON, self.data.panTiltLimits[i]) ?? null,
			]),
		),
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
		irisFollowPosition: self.data.irisFollowPosition,
		focusPositionPct: normalizePct(self.data.focusPosition, 0x0, 0xaaa, false),
		irisPositionPct: normalizePct(self.data.irisPosition, 0x0, irisMax, false),
		zoomPositionPct: normalizePct(self.data.zoomPosition, 0x0, 0xaaa, false, 1),
		irisFollowPositionPct: normalizePct(self.data.irisFollowPosition, 0x0, 0xff, false),
		focusPositionBar: progressBar(normalizePct(self.data.focusPosition, 0x0, 0xaaa), 10, 'N', 'F'),
		irisPositionBar: progressBar(normalizePct(self.data.irisPosition, 0x0, irisMax), 10, 'C', 'O'),
		zoomPositionBar: progressBar(normalizePct(self.data.zoomPosition, 0x0, 0xaaa), 10, 'W', 'T'),
		irisFollowPositionBar: progressBar(normalizePct(self.data.irisFollowPosition, 0x0, 0xff), 10, 'C', 'O'),

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

		// Direct temperature reading takes precedence over the indexed dropdown.
		colorTemperature: self.data.colorTempLabel ? self.data.colorTempLabel : labelled.colorTemperature,
		awbColorTemperature: self.data.awbColorTempLabel,

		ptSpeed: self.ptSpeed,
		pSpeed: self.pSpeed,
		tSpeed: self.tSpeed,
		zSpeed: self.zSpeed,
		fSpeed: self.fSpeed,
	})

	// if (SERIES.capabilities.presetNames && SERIES.capabilities.preset) {
	// 	const presetVars = {}
	// 	for (let i = 0; i < SERIES.capabilities.preset; i++) {
	// 		// An unread or never-named preset reads blank rather than stale, same reasoning as above.
	// 		presetVars[`presetName${i + 1}`] = self.data.presetNames[i] || null
	// 	}
	// 	self.setVariableValues(presetVars)
	// }

	if (SERIES.capabilities.audioVolumeLevel && self.data.audioVolumeLevels) {
		const audioVars = {}
		for (let ch = 0; ch < SERIES.capabilities.audioVolumeLevel.maxch; ch++) {
			audioVars[`audioVolumeLevel${ch + 1}`] =
				self.data.audioVolumeLevels[ch] !== undefined ? `${self.data.audioVolumeLevels[ch]}dB` : null
		}
		self.setVariableValues(audioVars)
	}
}
