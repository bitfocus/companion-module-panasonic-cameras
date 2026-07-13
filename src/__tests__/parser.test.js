import { describe, expect, it } from 'vitest'
import { parseUpdate } from '../parser.js'
import { constrainRange, getNext, getNextValue, getLabel, toHexString } from '../common.js'

// parseUpdate mutates self.data in place from the camera's notification strings.
function parse(...args) {
	const self = { data: { presetThumbnails: [], presetEntries: [], presetEntries0: [], presetEntries1: [], presetEntries2: [] }, getThumbnail: () => {} }
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
