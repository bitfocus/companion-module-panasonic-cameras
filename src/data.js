// Everything the camera tells us about itself, and the value each field holds before it has told us
// anything. The parser writes here; the variables and feedbacks read from here.
//
// A factory rather than a shared constant, for two reasons. A connection pointed at a different
// camera needs a *new* object — the previous camera's tally, lens positions and preset thumbnails are
// not true of the new one, and a value the new model never reports would otherwise keep the old
// camera's reading forever. And a shared literal would hand every instance the same arrays.
export function initialData() {
	return {
		debug: false,

		modelAuto: null,
		model: 'Auto',
		series: null,

		mac: null,
		serial: null,
		title: null,
		version: null,

		// unresolved enums
		autotrackingAngle: null,
		autotrackingEnabled: null,
		autotrackingMode: null,
		autotrackingStatus: null,
		chromaLevel: null,
		colorbar: null,
		colorTemperature: null,
		dnr: null,
		drs: null,
		error: null,
		filter: null,
		focusMode: null,
		gain: null,
		installMode: null,
		irisMode: null,
		nightMode: null,
		ois: null,
		power: null,
		presetScope: null,
		presetSpeed: null,
		presetSpeedTable: null,
		presetSpeedUnit: '0',
		recording: null,
		rtmp: null,
		sdInserted: null,
		sd2Inserted: null,
		shutter: null,
		srt: null,
		tally: null,
		tally2: null,
		tally3: null,
		ts: null,
		videoFormat: null,
		whiteBalance: null,

		// numeric index
		presetSelectedIdx: null,
		presetCompletedIdx: null,

		// numeric unsigned values
		focusPosition: null,
		irisPosition: null,
		irisVolume: null,
		panPosition: null,
		tiltPosition: null,
		zoomPosition: null,

		// numeric signed values
		chromaPhaseValue: 0,
		focusSpeedValue: 0,
		redGainValue: 0,
		blueGainValue: 0,
		greenGainValue: 0,
		redPedValue: 0,
		bluePedValue: 0,
		greenPedValue: 0,
		masterPedValue: 0,
		zoomSpeedValue: 0,

		// other strings
		colorTempLabel: null,
		irisLabel: null,
		shutterStepLabel: null,

		// arrays
		audioVolumeLevels: Array(4),
		presetEntries0: Array(40),
		presetEntries1: Array(40),
		presetEntries2: Array(20),
		presetEntries: Array(100),
		presetThumbnails: Array(100),

		// live image
		image: null,
	}
}
