import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseRefusal, parseUpdate, parseWeb, parseWebCode } from '../parser.js'
import { constrainRange, getNext, getNextValue, getLabel, seriesOf, toHexString } from '../common.js'
import { initialData } from '../data.js'
import { getFeedbackDefinitions } from '../feedbacks.js'
import { SERIES_SPECS } from '../models.js'

const seriesSpec = (id) => SERIES_SPECS.find((spec) => spec.id === id)

// parseUpdate mutates self.data in place from the camera's notification strings. The real shape, so a
// branch writing into a container the module initialises (presetThumbnails, panTiltLimits) is exercised
// rather than hand-waved past. A lens position is only stored where the series says it speaks that
// scale, so the series has to be there too; 'Other' is the set every PTZ camera shares.
function parseAs(series, ...args) {
	const self = { SERIES: seriesSpec(series), data: initialData(), getThumbnail: () => {} }
	parseUpdate(self, args)
	return self.data
}

function parse(...args) {
	return parseAs('Other', ...args)
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

	// The scale is the axis's, not the wire's. A camera that does not carry an axis must not have one
	// filled in behind its back, and a camera that reads the axis on another scale must not take a
	// lens-scale figure for it - which is how the box cameras' iris ended up at the clamp (issue #97).
	it('stores a lens position only where the series reads that axis on that scale', () => {
		const off = parseAs('HE2', 'lPI555666777')

		expect([off.zoomPosition, off.focusPosition, off.irisPosition]).toEqual([null, null, null])

		const on = parseAs('Other', 'lPI555666777')

		expect([on.zoomPosition, on.focusPosition, on.irisPosition]).toEqual([0, 0x666 - 0x555, 0x777 - 0x555])
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

	// Data2 says whether the temperature beside it is the one in effect. The CX350 camcorders send 1
	// while ATW is on, and the reading is then a leftover rather than the working value — bracketed, so
	// the button keeps showing a number without claiming it is in force.
	it.each([
		['0', '4000K'], // valid
		['1', '(4000K)'], // CX350 with ATW on
		['2', '(4000K)'], // the protocol's third value, unused by any model here
		[undefined, '4000K'], // a camera that reports Data1 alone
	])('reads the colour temperature with Data2 %s as %s', (validity, expected) => {
		const message = ['OSI', '20', '00FA0', validity].filter((part) => part !== undefined)

		expect(parse(...message).colorTempLabel).toBe(expected)
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
	// carries the temperature in effect. Data2 qualifies it: a reading the camera could not express
	// within its range comes out marked, so the value never reads as exact when it is not.
	it.each([
		['0', '3200K'], // valid
		['1', '<3200K'], // under
		['2', '>3200K'], // over
		[undefined, '3200K'], // a camera that reports Data1 alone
	])('reads the AWB colour temperature with Data2 %s as %s', (validity, expected) => {
		const message = ['OSJ', '4A', '00C80', validity].filter((part) => part !== undefined)

		expect(parse(...message).awbColorTempLabel).toBe(expected)
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

// Preset names are fixed-width on the wire; parsing removes that padding before caching the name.
describe('preset names', () => {
	it('drops the padding the camera stores the name in', () => {
		// Fifteen characters, fixed width, whatever the name actually is.
		expect(parse('OSJ', '35', '11', 'Wide Shot      ').presetNames[11]).toBe('Wide Shot')
	})

	it('reads an all-blank name as empty, which the camera accepts as a name', () => {
		expect(parse('OSJ', '35', '00', '               ').presetNames[0]).toBe('')
	})

	it('keeps the name off every other slot', () => {
		const data = parse('OSJ', '35', '99', 'Last           ')

		expect(data.presetNames[99]).toBe('Last')
		expect(data.presetNames.filter((n) => n !== undefined)).toEqual(['Last'])
	})
})

// The bitmap says which slots hold a preset, not what is in them: storing over an occupied slot leaves
// it byte-identical. The camera pushes the bank either way, so an occupied slot is refetched whenever
// its bank reports in. Names are not read along with it — storing a preset does not touch the name, and
// a name that changes says so through OSJ:35/36/37.
describe('the preset entry bitmap', () => {
	// 40 bits per bank, least significant first, so 0x…1 is preset 1 of that bank.
	const entryInstance = () => {
		const self = {
			data: initialData(),
			SERIES: { capabilities: { presetNames: true, presetThumbnails: true, preset: 100 } },
			config: { subscriptionEnable: true },
			thumbnails: [],
			queries: [],
			getThumbnail: (idx) => self.thumbnails.push(idx),
			getCam: (cmd) => self.queries.push(cmd),
			log() {},
		}
		return self
	}

	// The camera keeps the name against the position, not against the preset: clearing preset 1 and
	// storing a new one there leaves it called what it was called before.
	it('drops the thumbnail of a preset that was cleared but keeps its name', () => {
		const self = entryInstance()
		parseUpdate(self, ['pE000000000001'])
		self.data.presetThumbnails[0] = 'png'
		self.data.presetNames[0] = 'Wide Shot'

		parseUpdate(self, ['pE000000000000'])

		expect(self.data.presetThumbnails[0]).toBeUndefined()
		expect(self.data.presetNames[0]).toBe('Wide Shot')
	})

	it('refetches the thumbnails of the presets the bank holds', () => {
		const self = entryInstance()

		parseUpdate(self, ['pE000000000005']) // presets 1 and 3

		expect(self.thumbnails).toEqual([0, 2])
	})

	it('keeps refetching them while subscribed, on a bank that reads the same as before', () => {
		const self = entryInstance()
		parseUpdate(self, ['pE000000000001'])
		self.thumbnails = []

		parseUpdate(self, ['pE000000000001'])

		expect(self.thumbnails).toEqual([0])
	})

	it('places the second and third bank behind the first', () => {
		const self = entryInstance()

		parseUpdate(self, ['pE010000000001']) // preset 41
		parseUpdate(self, ['pE020000000001']) // preset 81

		expect(self.thumbnails).toEqual([40, 80])
	})

	it('reads a name once for a slot that fills, and not again', () => {
		const self = entryInstance()

		parseUpdate(self, ['pE000000000001'])
		expect(self.queries).toEqual(['QSJ:35:00'])
		self.data.presetNames[0] = 'Wide Shot'

		parseUpdate(self, ['pE000000000003']) // preset 2 joins it
		expect(self.queries).toEqual(['QSJ:35:00', 'QSJ:35:01'])
	})

	// The first read can simply not come back. Keying off the occupancy transition alone would leave that
	// preset nameless until the connection is rebuilt, because the slot never changes state again.
	it('asks again while a name it asked for has not arrived', () => {
		const self = entryInstance()

		parseUpdate(self, ['pE000000000001'])
		parseUpdate(self, ['pE000000000001'])

		expect(self.queries).toEqual(['QSJ:35:00', 'QSJ:35:00'])
	})

	// Polling re-reads the same three lines every cycle. Following each one up the way a push is followed
	// up would mean refetching every stored thumbnail every few seconds for as long as the connection
	// lives, so a polled bank is acted on only where it actually moved.
	describe('when polled instead of pushed', () => {
		const polled = () => {
			const self = entryInstance()
			self.config.subscriptionEnable = false
			return self
		}

		it('goes quiet once it has read a bank that is not changing', () => {
			const self = polled()
			parseUpdate(self, ['pE000000000001'])
			expect(self.thumbnails).toEqual([0])
			self.thumbnails = []

			parseUpdate(self, ['pE000000000001'])
			parseUpdate(self, ['pE000000000001'])

			expect(self.thumbnails).toEqual([])
		})

		it('still picks up a slot that fills', () => {
			const self = polled()
			parseUpdate(self, ['pE000000000001'])
			self.thumbnails = []

			parseUpdate(self, ['pE000000000003']) // preset 2 joins it

			expect(self.thumbnails).toEqual([1])
		})

		// A name is another matter: one text query per slot that has none, which stops as soon as one
		// arrives. Skipping those with the thumbnails would strand a first read that failed, since the
		// slot it belongs to is precisely the one not about to change.
		it('keeps asking for a name it has not got', () => {
			const self = polled()
			parseUpdate(self, ['pE000000000001'])
			expect(self.queries).toEqual(['QSJ:35:00'])

			parseUpdate(self, ['pE000000000001'])

			expect(self.queries).toEqual(['QSJ:35:00', 'QSJ:35:00'])
			expect(self.thumbnails).toEqual([0]) // ...without dragging the thumbnail along
		})

		it('stops asking once the name has arrived', () => {
			const self = polled()
			parseUpdate(self, ['pE000000000001'])
			self.data.presetNames[0] = 'Wide Shot'
			self.queries = []

			parseUpdate(self, ['pE000000000001'])

			expect(self.queries).toEqual([])
		})

		// The cost of the above: nothing announces an overwrite, and the bitmap cannot show one.
		it('cannot see a preset overwritten in place', () => {
			const self = polled()
			parseUpdate(self, ['pE000000000001'])
			self.thumbnails = []

			parseUpdate(self, ['pE000000000001'])

			expect(self.thumbnails).toEqual([])
		})
	})

	it('reads no names on a model without them', () => {
		const self = entryInstance()
		self.SERIES.capabilities.presetNames = false

		parseUpdate(self, ['pE00FFFFFFFFFF'])

		expect(self.queries).toEqual([])
		expect(self.thumbnails).toHaveLength(40)
	})
})

// The camera sends OSJ:35 through OSJ:3B as update notifications naming the preset that changed,
// whoever changed it. QSJ:3C is the odd one out, query-only, which is why it takes a sweep to read.
// Acting on the notifications keeps that sweep for what it is actually needed for: the initial sync,
// and cameras polled without a subscription.
describe('the preset name and thumbnail notifications', () => {
	const notified = () => {
		const self = {
			data: initialData(),
			SERIES: { capabilities: { presetNames: true, presetThumbnails: true, preset: 100 } },
			thumbnails: [],
			queries: [],
			getThumbnail: (idx) => self.thumbnails.push(idx),
			getCam: (cmd) => self.queries.push(cmd),
			log() {},
		}
		return self
	}

	// OSJ:36 and OSJ:37 put the camera's own Preset001-Preset100 back rather than leaving nothing, and
	// neither answer says so in words - hence the re-read instead of writing that wording from here.
	it('re-reads the name OSJ:36 reset', () => {
		const self = notified()
		self.data.presetNames[7] = 'Wide Shot'

		parseUpdate(self, ['OSJ', '36', '07'])

		expect(self.data.presetNames[7]).toBeUndefined()
		expect(self.queries).toEqual(['QSJ:35:07'])
	})

	it('re-reads the names OSJ:37 reset, for the presets that are in use', () => {
		const self = notified()
		self.data.presetEntries[0] = '1'
		self.data.presetEntries[42] = '1'
		self.data.presetNames[0] = 'Wide Shot'
		self.data.presetNames[42] = 'Tight'

		parseUpdate(self, ['OSJ', '37'])

		expect(self.data.presetNames.filter(Boolean)).toEqual([])
		expect(self.queries).toEqual(['QSJ:35:00', 'QSJ:35:42'])
	})

	it('refetches the one thumbnail OSJ:39 names', () => {
		const self = notified()

		parseUpdate(self, ['OSJ', '39', '12'])

		expect(self.thumbnails).toEqual([12])
	})

	it('drops one thumbnail on OSJ:3A and every one on OSJ:3B', () => {
		const self = notified()
		self.data.presetThumbnails[3] = 'png'
		self.data.presetThumbnails[8] = 'png'

		parseUpdate(self, ['OSJ', '3A', '03'])
		expect(self.data.presetThumbnails[3]).toBeUndefined()
		expect(self.data.presetThumbnails[8]).toBe('png')

		parseUpdate(self, ['OSJ', '3B'])
		expect(self.data.presetThumbnails.filter(Boolean)).toEqual([])
	})

	// 00 is preset 1 and 99 is preset 100; anything else is not a preset number the module can place.
	it.each(['OSJ:36', 'OSJ:3A'])('%s ignores a preset number it cannot place', (cmd) => {
		const self = notified()
		self.data.presetNames[0] = 'Wide Shot'
		self.data.presetThumbnails[0] = 'png'

		parseUpdate(self, [...cmd.split(':'), 'xx'])

		expect(self.data.presetNames[0]).toBe('Wide Shot')
		expect(self.data.presetThumbnails[0]).toBe('png')
	})

	it('fetches nothing for a thumbnail notification it cannot place', () => {
		const self = notified()

		parseUpdate(self, ['OSJ', '39', '100'])

		expect(self.thumbnails).toEqual([])
	})
})

// A name the user deliberately emptied is not the same as one the module has not read: the first is a
// button showing nothing but its thumbnail, the second is a button that should keep its own caption.
describe('the preset name feedback', () => {
	const feedbackFor = (names) => {
		const self = {
			config: { model: 'AW-UE150A' },
			data: { model: null, modelAuto: null, series: null, presetNames: names },
		}
		return getFeedbackDefinitions(self).presetName
	}

	it('shows a stored name', () => {
		expect(feedbackFor(['Wide Shot']).callback({ options: { option: 0 } })).toEqual({ text: 'Wide Shot' })
	})

	it('shows an empty name as empty', () => {
		expect(feedbackFor(['']).callback({ options: { option: 0 } })).toEqual({ text: '' })
	})

	it("leaves the button's own text alone while nothing has been read", () => {
		expect(feedbackFor([]).callback({ options: { option: 0 } })).toEqual({})
	})
})
