import { describe, expect, it } from 'vitest'
import { parseUpdate } from '../parser.js'
import { constrainRange, getNext, getNextValue, getLabel, seriesOf, toHexString } from '../common.js'

// parseUpdate mutates self.data in place from the camera's notification strings.
function parse(...args) {
	const self = {
		data: { presetThumbnails: [], presetEntries: [], presetEntries0: [], presetEntries1: [], presetEntries2: [] },
		getThumbnail: () => {},
	}
	parseUpdate(self, args)
	return self.data
}

describe('parseUpdate', () => {
	it('reads the error code', () => {
		expect(parse('rER03').error).toBe('03')
	})

	it('decodes lens positions, which are offset by 0x555', () => {
		expect(parse('gz555').zoomPosition).toBe(0)
		expect(parse('gzFFF').zoomPosition).toBe(0xfff - 0x555)
		expect(parse('gf000').focusPosition).toBe(-0x555)
	})

	it('decodes pan/tilt position, which is offset by 0x8000', () => {
		const data = parse('aPC80008000')
		expect(data.panPosition).toBe(0)
		expect(data.tiltPosition).toBe(0)
	})

	it('decodes the combined lens position report', () => {
		const data = parse('lPI555555555')
		expect(data.zoomPosition).toBe(0)
		expect(data.focusPosition).toBe(0)
		expect(data.irisPosition).toBe(0)
	})

	it('decodes the three tally colours from one message', () => {
		const data = parse('tAA100000000000')
		expect(data.tally).toBe('1')
		expect(data.tally2).toBe('0')
		expect(data.tally3).toBe('0')
	})

	it('maps every power state onto on/off', () => {
		expect(parse('p0').power).toBe('0') // standby
		expect(parse('p1').power).toBe('1') // on
		expect(parse('p3').power).toBe('1') // starting
		expect(parse('p4').power).toBe('0') // off
		expect(parse('p5').power).toBe('1') // rebooting
	})

	it('renders a closed iris as CLOSE rather than an f-number', () => {
		expect(parse('OIF', 'FF').irisLabel).toBe('CLOSE')
		expect(parse('OIF', '28').irisLabel).toBe('f/4.0')
	})

	it('picks up the auto-detected camera model', () => {
		expect(parse('OID', 'AW-UE150').modelAuto).toBe('AW-UE150')
	})

	it('decodes speed values, which are offset by 50', () => {
		expect(parse('zS50').zoomSpeedValue).toBe(0)
		expect(parse('fS99').focusSpeedValue).toBe(49)
	})

	// NaN publishes as a NaN variable, satisfies the zoomControl feedback (NaN != 0) so the button
	// latches lit, and comes back out of lensAxis as a literal "#ZNaN" on the wire.
	it.each(['zS', 'zSx', 'zS-', 'fS', 'fSab'])('keeps the last known speed rather than storing NaN for %s', (cmd) => {
		const self = {
			data: {
				zoomSpeedValue: 7,
				focusSpeedValue: 7,
				presetThumbnails: [],
				presetEntries: [],
				presetEntries0: [],
				presetEntries1: [],
				presetEntries2: [],
			},
			getThumbnail: () => {},
		}
		parseUpdate(self, [cmd])

		expect(self.data.zoomSpeedValue).toBe(7)
		expect(self.data.focusSpeedValue).toBe(7)
	})

	// The camera writes "OSI:20:0x00FA0:0". getCameraStatus strips that prefix before parsing, so the
	// camdata.html path always arrives clean — but it does so with replace(':0x', ':'), which takes
	// only the first match (compare "OSI:18:0xFFF:0x555:0xD24", where the last two keep theirs). The
	// getCam path behind the QSI:20 pull strips nothing at all, so both forms have to read the same.
	it.each([
		['00FA0', '4000K'],
		['0x00FA0', '4000K'],
	])('reads the colour temperature from %s whether or not the 0x was stripped', (data, expected) => {
		expect(parse('OSI', '20', data, '0').colorTempLabel).toBe(expected)
	})

	// Iris Follow is the lens's own position, 00h closed to FFh open. It shipped in three poll lists
	// from the very first commit with no branch to receive it, so the answer was thrown away every
	// cycle until this case existed.
	it.each([
		['00', 0],
		['7F', 127],
		['0x7F', 127], // only the camdata path strips the prefix; parseInt takes it either way
		['FF', 255],
	])('reads the iris follow position from %s', (data, expected) => {
		expect(parse('OSD', '4F', data).irisFollowPosition).toBe(expected)
	})

	// The camera's own fault state, as a bitmask: several faults can stand at once. OER carries two
	// bits, OSI:46 five, and they are kept apart because a model that speaks both would otherwise
	// flip the value - bit 1 means "Other" to OER and "High Temperature" to OSI:46.
	it('reads the coarse camera error from OER', () => {
		expect(parse('OER', '0').errorCamera).toBe(0)
		expect(parse('OER', '1').errorCamera).toBe(1)
		expect(parse('OER', '2').errorCamera).toBe(2)
	})

	it.each([
		['00000000', 0],
		['00000012', 0x12], // fan and pan/tilt
		['0x00000012', 0x12], // the camdata spelling, which carries the prefix
		['00000010', 0x10],
	])('reads the detailed camera error from OSI:46:%s', (data, expected) => {
		expect(parse('OSI', '46', data).errorCameraDetail).toBe(expected)
	})

	// One PTG stands in for five separate queries, so the pull lists of the models that support it
	// depend on all five fields coming out of a single token.
	it('decodes gain, colour temperature, shutter and ND from one PTG report', () => {
		// gain 12 | 00FA0 K | shutter mode 1 | step 2710 | synchro 00000 | ND 0
		const data = parse('pTG1200FA012710000000')

		expect(data.gain).toBe('12')
		expect(data.colorTempLabel).toBe('4000K')
		expect(data.shutter).toBe('1')
		expect(data.shutterStepLabel).toBe('1/10000')
		expect(data.filter).toBe('0')
	})
})

// checkVariables() runs after every HTTP response and every TCP batch. Resolving the series there
// meant two Array.find scans over the model tables, plus a write to self.data, on that hot path.
describe('seriesOf', () => {
	const bare = (model) => ({ config: { model }, data: { model: null, modelAuto: null, series: null } })

	it('hands back what the connection already resolved instead of scanning again', () => {
		const resolved = { id: 'UE160', capabilities: {} }
		const self = { ...bare('AW-HE2'), SERIES: resolved }

		expect(seriesOf(self)).toBe(resolved)
		expect(self.data.model).toBeNull() // the hot path writes nothing
	})

	it('still resolves for a caller with no connection behind it', () => {
		// The upgrade scripts and the definition tests build a bare self; so does reInitAll() until the
		// camera has answered QID.
		expect(seriesOf(bare('AW-HE2')).capabilities.preset).toBe(9)
	})
})

describe('common helpers', () => {
	it('clamps to the range rather than wrapping', () => {
		expect(constrainRange(5, 0, 10)).toBe(5)
		expect(constrainRange(-1, 0, 10)).toBe(0)
		expect(constrainRange(11, 0, 10)).toBe(10)
	})

	const values = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

	it('wraps around when stepping past the end', () => {
		expect(getNext(values, 'c').id).toBe('a')
		expect(getNext(values, 'a', -1).id).toBe('c')
	})

	it('stops at the edges when overrun is disabled', () => {
		expect(getNext(values, 'c', 1, false).id).toBe('c')
		expect(getNext(values, 'a', -1, false).id).toBe('a')
	})

	it('falls back to the first entry for an unknown key', () => {
		expect(getNext(values, 'zzz').id).toBe('a')
	})

	it('clamps stepped values to the range', () => {
		expect(getNextValue(9, 0, 10, 5)).toBe(10)
		expect(getNextValue(1, 0, 10, -5)).toBe(0)
	})

	it('formats hex to a fixed width in upper case', () => {
		expect(toHexString(255, 4)).toBe('00FF')
		expect(toHexString(0, 2)).toBe('00')
	})

	it('returns undefined for a label that does not exist', () => {
		expect(getLabel([{ id: '1', label: 'One' }], '1')).toBe('One')
		expect(getLabel([{ id: '1', label: 'One' }], '2')).toBeUndefined()
	})
})
