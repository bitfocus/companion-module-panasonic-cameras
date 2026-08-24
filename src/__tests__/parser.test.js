import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseRefusal, parseUpdate, parseWeb, parseWebCode } from '../parser.js'
import { constrainRange, getNext, getNextValue, getLabel, seriesOf, toHexString } from '../common.js'
import { initialData } from '../data.js'

// parseUpdate mutates self.data in place from the camera's notification strings. The real shape, so a
// branch writing into a container the module initialises (presetThumbnails, panTiltLimits) is exercised
// rather than hand-waved past.
function parse(...args) {
	const self = { data: initialData(), getThumbnail: () => {} }
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

	// The camera reports the result of a balance run only over the notification channel — no query
	// returns it, and camdata.html carries neither OWS nor OAS. With res=1 it answers "OWS" the moment it
	// accepts the request, seconds before the balance has run, so reading that echo as success would
	// report an outcome the camera has not reached yet.
	describe('AWB/ABB result', () => {
		it.each([
			['OWS', 'awbResult'],
			['OAS', 'abbResult'],
		])('reads a pushed %s as success', (command, key) => {
			expect(parse(command)[key]).toBe('OK')
		})

		// A pushed refusal is a verdict on the run: the camera took the command and is reporting that the
		// balance itself came out NG.
		it.each([
			['ER3', 'OWS', 'awbResult', 'NG'],
			['ER2', 'OWS', 'awbResult', 'NG (Busy)'],
			['ER3', 'OAS', 'abbResult', 'NG'],
			['ER2', 'OAS', 'abbResult', 'NG (Busy)'],
		])('reads a pushed %s:%s as %s = %s', (code, command, key, expected) => {
			expect(parse(code, command)[key]).toBe(expected)
		})

		// Everything the camera says in reply to the command clears instead, whether it takes the request
		// or turns it down: nothing has been balanced yet either way, and the OK of an earlier run must not
		// stand there as if it were this one's outcome.
		it.each([
			[['OWS'], 'awbResult'],
			[['OAS'], 'abbResult'],
			[['ER3', 'OWS'], 'awbResult'],
			[['ER2', 'OWS'], 'awbResult'],
			[['ER3', 'OAS'], 'abbResult'],
			[['ER2', 'OAS'], 'abbResult'],
		])('clears the previous result on the %s echo', (message, key) => {
			const data = initialData()

			parseUpdate({ data }, [key === 'awbResult' ? 'OWS' : 'OAS'])
			expect(data[key]).toBe('OK')

			parseUpdate({ data }, message, { echo: true })
			expect(data[key]).toBeNull()
		})

		// ER1 does mean "I have no such command" — a model without ABB, say — and is not an outcome.
		it('leaves the result alone for an unsupported-command refusal', () => {
			expect(parse('ER1', 'OWS').awbResult).toBeNull()
		})

		it('leaves both results alone for a refusal of some other command', () => {
			const data = parse('ER3', 'OGU')

			expect(data.awbResult).toBeNull()
			expect(data.abbResult).toBeNull()
		})
	})

	// OSJ:4A is the AWB A/AWB B "Color TEMP. Setting"; OSI:20 is the VAR colour temperature this module
	// controls. A camera reports both and camdata.html puts OSJ:4A last, so parsing it into the same field
	// replaced the temperature in effect with the one that is not: an AW-UE150 in VAR at 4060K showed the
	// 3200K of its AWB setting after every restart.
	it('does not let the AWB colour temperature overwrite the one in effect', () => {
		const data = initialData()

		parseUpdate({ data }, ['OSI', '20', '00FDC', '0'])
		parseUpdate({ data }, ['OSJ', '4A', '00C80', '0'])

		expect(data.colorTempLabel).toBe('4060K')
	})

	// The AWB temperature is a reading in its own right, so it is kept — just not in the field that
	// carries the temperature in effect.
	it('keeps the AWB colour temperature in its own field', () => {
		expect(parse('OSJ', '4A', '00C80', '0').awbColorTempLabel).toBe('3200K')
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

	// lC[direction][state], four independent booleans. It has to be matched before lPI or it would never
	// be reached - both replies start with a lowercase l.
	it.each([
		['lC11', ['1', null, null, null]],
		['lC20', [null, '0', null, null]],
		['lC31', [null, null, '1', null]],
		['lC40', [null, null, null, '0']],
	])('reads the movement range limit from %s', (token, expected) => {
		expect(parse(token).panTiltLimits).toEqual(expected)
	})

	it('leaves the limits alone for the lens position report, which also starts with l', () => {
		const data = parse('lPI555555555')

		expect(data.panTiltLimits).toEqual([null, null, null, null])
		expect(data.zoomPosition).toBe(0)
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

	// The POVCAM series answers with OSK where the other cameras use OSJ/OSD, so these four fields have
	// no other way in; without the case the actions work while the variables stay empty forever.
	it('decodes the POVCAM OSK replies', () => {
		expect(parse('OSK', '02', '9E').chromaLevel).toBe('9E')
		expect(parse('OSK', '02', '0x9E').chromaLevel).toBe('9E')
		expect(parse('OSK', '03', '80').chromaPhaseValue).toBe(0)
		expect(parse('OSK', '03', '9F').chromaPhaseValue).toBe(31)
		expect(parse('OSK', '03', '62').chromaPhaseValue).toBe(-30)
		expect(parse('OSK', '05', '87').dnr).toBe('87')
		expect(parse('OSK', '08', '8E').shutter).toBe('8E')
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

// These CGIs answer with a status code and no body, so the code is the entire reply.
describe('parseWebCode', () => {
	function code(statusCode, cmd) {
		const self = { data: initialData() }
		parseWebCode(self, statusCode, cmd)
		return self.data
	}

	it.each([
		['srt_ctrl?cmd=start', 'srt', '1'],
		['srt_ctrl?cmd=stop', 'srt', '0'],
		['ts_ctrl?cmd=start', 'ts', '1'],
		['ts_ctrl?cmd=stop', 'ts', '0'],
		['rtmp_ctrl?cmd=start', 'rtmp', '1'],
		['rtmp_ctrl?cmd=stop', 'rtmp', '0'],
		['sdctrl?save=start', 'recording', '1'],
		['sdctrl?save=end', 'recording', '0'],
		['initial?cmd=reset&Randomnum=12345', 'power', '0'],
	])('takes 204 on %s as the camera having done it', (cmd, field, expected) => {
		expect(code(204, cmd)[field]).toBe(expected)
	})

	// 503 was accepted here alongside 204, as a second flavour of "no content" — but these cameras send
	// it when the command's precondition does not hold (SRT not the selected protocol, card not ready),
	// so it says the opposite of what it was read as. Recording it as a started stream would put the
	// module's state at odds with the camera's until the next poll disagreed.
	it('does not take 503 as the camera having done it', () => {
		expect(code(503, 'srt_ctrl?cmd=start').srt).toBeNull()
		expect(code(503, 'sdctrl?save=start').recording).toBeNull()
	})

	it('leaves state alone for a command it does not know', () => {
		expect(code(204, 'get_basic')).toEqual(initialData())
	})
})

// Strings measured on an AW-UE150 V3.20: aw_ptz answers lower-case, aw_cam upper-case.
describe('parseRefusal', () => {
	it.each([
		['eR1:XF', 1, 'XF'],
		['ER1:QXF', 1, 'QXF'],
		['eR2:S', 2, 'S'],
		['ER2:OWS', 2, 'OWS'],
		['eR3:AXZ', 3, 'AXZ'],
		['ER3:OGU', 3, 'OGU'],
	])('reads %s as a refusal', (str, code, command) => {
		expect(parseRefusal(str)).toEqual({ code, command })
	})

	// The camera names the command only, cut at three characters, with everything the module sent
	// after it dropped. So the echo is not what was sent, and nothing downstream may assume it is.
	it.each([
		['eR1:AXZ', 'AXZ'], // sent #AXZFFFF
		['ER1:QSL', 'QSL'], // sent QSL:36:99
		['eR1:XYZ', 'XYZ'], // sent #XYZ123
	])('hands back %s as the camera wrote it', (str, command) => {
		expect(parseRefusal(str).command).toBe(command)
	})

	// Ordinary answers must not be mistaken for refusals — several start with the same letters.
	it.each(['s00', 'aPCA1C67FE2', 'rER00', 'OER:0', 'OSI:46:00000000', 'ER4:XX', 'ER:XX', 'lC10'])(
		'reads %s as an ordinary answer',
		(str) => {
			expect(parseRefusal(str)).toBeNull()
		},
	)
})

// The compatible-model table's ▼OAW section: a White Balance query answers in a different encoding
// than the control command takes. 1 is never returned, and 2 and 3 come back one step below what
// sets them — so an unmapped reply named the wrong mode (2) or none at all (3).
//
// The '3' case is measured, not read off a table: an AW-HE40 standing in AWC B answers OAW:3. The
// other spec calls 3 a second ATW for this family, so the two disagree and only the camera settles it.
describe('the white balance confirmation encoding', () => {
	const he40 = () => ({
		data: initialData(),
		getThumbnail: () => {},
		SERIES: { capabilities: { whiteBalance: { confirm: { 2: '1', 3: '2' } } } },
	})

	it.each([
		['0', '0'], // ATW, same either way
		['2', '1'], // the camera means AWC A, which is 1 in the control encoding
		['3', '2'], // the camera means AWC B — the reply that used to leave the variable empty
		['4', '4'], // Preset 3200K, same either way
		['5', '5'],
		['9', '9'], // VAR
	])('reads OAW:%s back as %s', (answered, expected) => {
		const self = he40()
		parseUpdate(self, ['OAW', answered])

		expect(self.data.whiteBalance).toBe(expected)
	})

	// The same "OAW:3" means ATW when it is a control command being handed back, and AWC B when the
	// camera is reporting its own state. Only the caller knows which, so only the caller can say.
	it.each([
		['3', '3'], // the ATW an action just set, repeated back
		['1', '1'], // AWC A
		['2', '2'], // AWC B
	])('leaves OAW:%s alone when it is an action reading its own value back', (answered, expected) => {
		const self = he40()
		parseUpdate(self, ['OAW', answered], { echo: true })

		expect(self.data.whiteBalance).toBe(expected)
	})

	// The CX350 and HE2 answer in the encoding they take, and carry no map.
	it('leaves the answer alone for a series that needs no mapping', () => {
		const self = { data: initialData(), getThumbnail: () => {}, SERIES: { capabilities: { whiteBalance: {} } } }
		parseUpdate(self, ['OAW', '3'])

		expect(self.data.whiteBalance).toBe('3')
	})

	// parseUpdate also runs from the upgrade scripts and the tests, on a `self` with no series at all.
	it('does not require a resolved series', () => {
		const self = { data: initialData(), getThumbnail: () => {} }
		parseUpdate(self, ['OAW', '3'])

		expect(self.data.whiteBalance).toBe('3')
	})
})

// The parser logs through the base package's module logger rather than the instance, so it was
// missed when everything else moved off info. A detected model is protocol detail like the rest: it
// belongs in the log Companion filters, not in the one an operator reads on a healthy connection.
describe("the parser's own logging", () => {
	const captured = []

	beforeEach(() => {
		captured.length = 0
		globalThis.COMPANION_LOGGER = (_source, level, message) => captured.push([level, message])
	})
	afterEach(() => {
		delete globalThis.COMPANION_LOGGER
	})

	it('reports the model detected over aw_cam at debug', () => {
		parseUpdate({ data: initialData(), getThumbnail: () => {} }, ['OID', 'AW-UE150'])

		expect(captured).toEqual([['debug', 'Detected Camera Model: AW-UE150']])
	})

	it('reports the model detected over the web CGI at debug', () => {
		parseWeb({ data: initialData() }, ['NAME', 'AW-UE150'], 'getinfo?FILE=1')

		expect(captured).toEqual([['debug', 'Detected Camera Model: AW-UE150']])
	})

	// Every init resolves the model; only a change is worth a line.
	it('says nothing when the model is the one already resolved', () => {
		const data = initialData()
		data.model = 'AW-UE150'

		parseUpdate({ data, getThumbnail: () => {} }, ['OID', 'AW-UE150'])

		expect(captured).toEqual([])
	})
})

// OSJ:D2 is the filter actually in place; OFT is the setting, and the setting can be Auto ND. They
// shared `data.filter` until they were split, so whichever arrived last decided what the ND Filter
// variable said — a camera in Auto ND could read as a fixed filter, or a fixed one as Auto.
describe('the ND filter follow status', () => {
	it('reads OSJ:D2 into its own field', () => {
		expect(parse('OSJ', 'D2', '2').filterFollow).toBe('2')
	})

	it('leaves the filter setting alone', () => {
		const data = initialData()

		parseUpdate({ data }, ['OFT', '8']) // Auto ND
		parseUpdate({ data }, ['OSJ', 'D2', '2']) // ...which settled on 1/16 ND

		expect(data.filter).toBe('8')
		expect(data.filterFollow).toBe('2')
	})

	it('is not touched by the filter setting either', () => {
		const data = initialData()

		parseUpdate({ data }, ['OSJ', 'D2', '3'])
		parseUpdate({ data }, ['OFT', '0'])

		expect(data.filterFollow).toBe('3')
	})
})
