import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { MODELS, SERIES_SPECS } from '../models.js'
import { getPresetDefinitions } from '../presets.js'
import { getActionDefinitions } from '../actions.js'
import { getFeedbackDefinitions } from '../feedbacks.js'
import { setVariables } from '../variables.js'

// The option field types module-base 2.x accepts.
const FIELD_TYPES = [
	'static-text',
	'textinput',
	'dropdown',
	'multidropdown',
	'colorpicker',
	'number',
	'checkbox',
	'custom-variable',
	'bonjour-device',
	'secret-text',
]

// Properties removed in 2.0, each shipped in this module at some point.
const REMOVED_FIELD_PROPS = ['isVisible', 'required']
const REMOVED_PRESET_OPTIONS = ['relativeDelay', 'rotaryActions']

// The option ids the removed "Use Variable" checkbox left behind (see dropUseVarToggles in upgrades.js).
const REMOVED_OPTION_IDS = ['useVar', 'setVar', 'stepVar', 'valVar', 'optionVar']

// Fields whose value a callback parses and constrains itself: stepped number inputs (marked by
// `asInteger`) and the preset dropdown. Other number fields are left for Companion to reject.
const isConstrained = (field) =>
	(field.type === 'number' && field.asInteger) ||
	(field.type === 'dropdown' && field.choices?.[0]?.label?.startsWith('Preset '))

// One representative model per series, so every capability branch gets built.
const seenSeries = new Set()
const MODELS_BY_SERIES = MODELS.filter((m) => m.id !== 'Auto' && !seenSeries.has(m.series) && seenSeries.add(m.series))

function mockInstance(model) {
	return { config: { model }, data: { model: null, modelAuto: null, series: null, presetThumbnails: [] } }
}

function seriesSpec(series) {
	return SERIES_SPECS.find((s) => s.id === series)
}

// The manifest's product list is what Companion searches when someone adds a connection, so a camera
// missing from it is a camera nobody finds by name — which is how the AW-UE5 and AK-UBX100 sat in the
// model table for a while without being listed.
describe('manifest products', () => {
	const products = JSON.parse(readFileSync(new URL('../../companion/manifest.json', import.meta.url)))?.products

	// 'Other' is the unknown-camera fallback, not a product; 'Cameras' is the catch-all heading.
	const named = MODELS.map((m) => m.id).filter((id) => id !== 'Auto' && id !== 'Other')

	it('lists every model the module knows', () => {
		expect(products).toEqual(expect.arrayContaining(named))
	})

	it('names no camera the model table does not know', () => {
		expect(products.filter((p) => p !== 'Cameras' && !named.includes(p))).toEqual([])
	})
})

// The variable tables are the only place a user learns what the module publishes, and nothing tied
// them to the code — which is how $(errorCamera), $(customResponse) and the four limit variables all
// shipped undocumented. HELP.md is packaged with the module, README.md is what GitHub shows.
describe('documented variables', () => {
	const DOCS = ['companion/HELP.md', 'README.md']
	const read = (file) => readFileSync(new URL('../../' + file, import.meta.url), 'utf8')
	const documented = (file) => new Set([...read(file).matchAll(/`\$\((\w+)\)`/g)].map((m) => m[1]))

	const published = new Set(
		MODELS.filter((m) => m.id !== 'Auto').flatMap((m) => Object.keys(setVariables(mockInstance(m.id)))),
	)

	// The per-channel audio variables get one collective row, `$(audioVolumeLevel1…N)`, because how many
	// there are depends on the model. The ellipsis keeps it out of the match above.
	const collective = /^audioVolumeLevel\d+$/

	it.each(DOCS)('%s lists every variable the module publishes', (file) => {
		const missing = [...published].filter((v) => !documented(file).has(v) && !collective.test(v))

		expect(missing.sort()).toEqual([])
	})

	it.each(DOCS)('%s names no variable the module never publishes', (file) => {
		expect([...documented(file)].filter((v) => !published.has(v)).sort()).toEqual([])
	})

	it('keeps the two tables identical', () => {
		const rows = (file) => read(file).match(/^\| `\$\(.*$/gm)

		expect(rows(DOCS[0])).toEqual(rows(DOCS[1]))
	})
})

// A level capability drives optSetIncDecStep() and cmdValue(): `step` becomes the Step size field's
// default *and* its min, `hexlen` the width of the value on the wire. Miss either and the field ships
// with `default: undefined`, fillOmittedOptions skips it (it only fills ids that have a default), and
// resolveSetStep() gets parseInt(undefined) -> NaN, so the action returns having sent nothing. That is
// how the AK-UB300's Master Pedestal shipped as a silent no-op.
describe('level capabilities', () => {
	const LEVELS = SERIES_SPECS.flatMap((spec) =>
		Object.entries(spec.capabilities)
			.filter(([, cap]) => cap && typeof cap === 'object' && 'offset' in cap && 'limit' in cap)
			.map(([name, cap]) => ({ series: spec.id, name, cap })),
	)

	it('is a set worth checking', () => {
		expect(LEVELS.length).toBeGreaterThan(0)
	})

	it.each(LEVELS)('$series.$name carries the step and hexlen the action needs', ({ cap }) => {
		expect(cap.step).toBeTypeOf('number')
		expect(cap.step).toBeGreaterThan(0)
		expect(cap.hexlen).toBeTypeOf('number')
	})

	it.each(LEVELS)('$series.$name declares a hexlen wide enough for its own range', ({ cap }) => {
		const widest = Math.max(cap.offset + cap.limit, Math.abs(cap.offset - cap.limit))
		expect(widest.toString(16).length).toBeLessThanOrEqual(cap.hexlen)
	})
})

// Colour temperature steps in the camera's own notches: OSI:1E/OSI:1F take a count of 1h to Ah, so
// maxStep is what bounds the Steps field — not the Kelvin range that bounds OSI:20. Miss it and the
// field ships with `max: undefined`, which is the same silent no-op the level capabilities guard
// against above.
describe('colour temperature capabilities', () => {
	const ADVANCED = SERIES_SPECS.filter((spec) => spec.capabilities.colorTemperature?.advanced).map((spec) => ({
		series: spec.id,
		cap: spec.capabilities.colorTemperature.advanced,
	}))

	it('is a set worth checking', () => {
		expect(ADVANCED.length).toBeGreaterThan(0)
	})

	it.each(ADVANCED)('$series carries a notch count the wire can encode', ({ cap }) => {
		expect(cap.maxStep).toBeTypeOf('number')
		expect(cap.maxStep).toBeGreaterThanOrEqual(1)
		expect(cap.maxStep).toBeLessThanOrEqual(0xa) // OSI:1E:[Data] is a single hex digit
	})

	it.each(ADVANCED.filter(({ cap }) => cap.set))('$series bounds its Kelvin range', ({ cap }) => {
		expect(cap.min).toBeTypeOf('number')
		expect(cap.max).toBeGreaterThan(cap.min)
	})
})

// Without a subscription, `pull` is the only source for everything the camera would otherwise push
// (see pollCameraStatus). A capability that drives a variable but has nothing querying it leaves that
// variable blank forever — which is how six series shipped with no pull list at all. Each entry names
// the capability and every query that would satisfy it; one of them has to be in the list.
describe('pull coverage', () => {
	// The broad PT queries stand in for several narrow ones: PTG carries gain, colour temperature,
	// shutter, shutter step and ND; PTV carries pan/tilt/zoom/focus/iris; TAA carries all three tallies.
	const REQUIRED = [
		['colorbar', () => ['QBR']],
		['whiteBalance', (c) => (c.whiteBalance.dropdown ? ['QAW'] : null)],
		['focusAuto', () => ['QAF', 'D1']],
		['irisAuto', () => ['QRS', 'D3', 'GI']],
		['irisF', () => ['QIF', 'PTD']],
		['irisFollowPosition', () => ['QSD:4F']],
		['errorCamera', (c) => [c.errorCamera.cmd]],
		['panTiltLimit', () => ['LC1']],
		['ois', () => ['QIS']],
		['videoFormat', () => ['QSA:87']],
		['dnr', (c) => ['Q' + c.dnr.cmd.slice(1)]],
		['drs', () => ['QSE:33']],
		['chromaPhase', (c) => ['Q' + c.chromaPhase.cmd.slice(1)]],
		['install', () => ['INS']],
		['night', () => ['D6']],
		['error', () => ['RER']],
		['power', () => ['O']],
		['preset', () => ['PE00']],
		['presetSpeed', () => ['PST', 'UPVS']],
		['presetTime', () => ['QSJ:29']],
		['trackingAuto', () => ['QSL:B6']],
		['shootingMode', () => ['QSI:30']],
		['tally', () => ['TAA', 'QLR', 'DA']],
		['tally2', () => ['TAA', 'QLG']],
		['tally3', () => ['TAA', 'QLY']],
		['audioVolumeLevel', () => ['QSA:D5:0']],
		['chromaLevel', (c) => ['Q' + c.chromaLevel.cmd.slice(1), 'QCG']],
		['gain', (c) => ['Q' + c.gain.cmd.slice(1), 'PTG']],
		['shutter', (c) => ['Q' + c.shutter.cmd.slice(1), 'PTG']],
		['filter', () => ['QFT', 'QSJ:D2', 'PTG']],
		['pedestal', (c) => ['Q' + c.pedestal.cmd.slice(1)]],
		// #APC is a query only on the HD Integrated line; the newer models answer #PTV instead, and the
		// four that can do neither do not carry the capability at all.
		['panTiltPosition', () => ['APC', 'PTV']],
		['zoom', () => ['PTV', 'LPI', 'AXZ', 'GZ', 'QSI:18']],
		['focus', () => ['PTV', 'LPI', 'AXF', 'GF', 'QSI:18']],
		[
			'colorTemperature',
			(c) => (c.colorTemperature.index ? ['Q' + c.colorTemperature.index.cmd.slice(1)] : ['QSI:20', 'QSJ:4A', 'PTG']),
		],
	]

	// CX350 has subscription false, so it never gets a push and `poll` carries what pull would.
	const queriesOf = (spec) => {
		const lists = [spec.capabilities.pull, spec.capabilities.poll].filter(Boolean)
		return new Set(lists.flatMap((l) => ['ptz', 'cam', 'web'].flatMap((k) => l[k] || [])))
	}

	// Named exemptions, so a gap is a decision on record rather than a hole the test quietly allows.
	const EXEMPT = {
		// The unknown-camera fallback. BASE_CAPABILITIES advertises nearly everything, so covering it in
		// full would mean ~40 queries per cycle against a camera that may support none of them. It gets
		// the small set almost any Panasonic PTZ answers; anyone needing more picks their actual model.
		Other: '*',
		// The AW-HE2 is the only camera that pushes OSD:4F and offers no query for it — "QSD:4F" appears
		// nowhere in its specification. Its notification table carries Iris Follow, so the variable fills
		// itself; asking would earn an ER1.
		HE2: ['irisFollowPosition'],
		// POVCAM documents no QSA:87. Its camdata.html table carries OSA:87, and the bulk read runs on
		// every connect, which is often enough for a format that only changes with the system frequency.
		POVCAM: ['videoFormat'],
	}
	const exempt = (series, name) => EXEMPT[series] === '*' || EXEMPT[series]?.includes(name)

	const CASES = SERIES_SPECS.flatMap((spec) =>
		REQUIRED.flatMap(([name, wants]) => {
			const cap = spec.capabilities[name]
			if (!cap || exempt(spec.id, name)) return []
			const accepted = wants(spec.capabilities)
			return accepted ? [{ series: spec.id, name, accepted, have: queriesOf(spec) }] : []
		}),
	)

	it('is a set worth checking', () => {
		expect(CASES.length).toBeGreaterThan(200)
	})

	it.each(CASES)('$series queries something for $name', ({ accepted, have }) => {
		expect(accepted.some((q) => have.has(q))).toBe(true)
	})

	// The PT command table lists no box camera: without a pan/tilt head they answer nothing on aw_ptz,
	// so a `#` command in their list is a request that can only ever fail. This does not extend to the
	// CX350 camcorders — their own spec documents #GZ/#GF/#GI for the lens positions.
	it.each(['UB300', 'UB50', 'UBX100'])('%s sends no PT command, having no PT head', (id) => {
		const caps = SERIES_SPECS.find((s) => s.id === id).capabilities

		expect(caps.pull && caps.pull.ptz).toBeFalsy()
		expect(caps.poll && caps.poll.ptz).toBeFalsy()
	})

	// The error indicator answers one question - "is something wrong" - from two sources: rER for the
	// pan/tilt head, OER or OSI:46 for the camera. Its callback is where the null case has to be handled,
	// because data.error starts null and `null !== '00'` is true: that lit the button on every model that
	// never sends rER, and on every model for the stretch before the first one arrived.
	describe('the error condition feedback', () => {
		const lit = (data) => {
			const self = {
				config: { model: 'AW-UE150' },
				data: { model: null, modelAuto: null, series: null, presetThumbnails: [], error: null, ...data },
			}
			return getFeedbackDefinitions(self).error.callback({})
		}

		it('stays dark until the camera has said anything at all', () => {
			expect(lit({})).toBe(false)
		})

		it('stays dark while the camera reports no fault', () => {
			expect(lit({ error: '00', errorCameraDetail: 0 })).toBe(false)
		})

		it('lights for a head error', () => {
			expect(lit({ error: '03' })).toBe(true)
		})

		it('lights for a camera error, which rER would never mention', () => {
			expect(lit({ error: '00', errorCameraDetail: 0x02 })).toBe(true)
			expect(lit({ error: '00', errorCamera: 0x01 })).toBe(true)
		})

		it('is not offered where the camera reports neither', () => {
			const self = {
				config: { model: 'AW-UE4' },
				data: { model: null, modelAuto: null, series: null, presetThumbnails: [] },
			}

			expect(getFeedbackDefinitions(self).error).toBeUndefined()
		})
	})

	// Black balance is its own capability rather than a rider on white balance: these models take OWS but
	// answer ER3 to OAS, each spec saying so outright ("UE4 does not ABB function", and UB10/UB50 never
	// mention OAS at all). Offering the button there would leave the result reading NG for good.
	it.each(['UE4', 'UE5', 'UE20', 'UB50', 'HE50'])('%s claims no black balance', (id) => {
		expect(SERIES_SPECS.find((s) => s.id === id).capabilities.blackBalance).toBe(false)
	})

	it('offers no ABB action, feedback or preset on a camera that cannot black balance', () => {
		const self = mockInstance('AW-UE4')

		expect(getActionDefinitions(self).whiteBalanceExecABB).toBeUndefined()
		expect(getFeedbackDefinitions(self).abbResultOk).toBeUndefined()
		expect(getFeedbackDefinitions(self).abbResultNg).toBeUndefined()
		expect(getPresetDefinitions(self).presets['image-abb']).toBeUndefined()

		// The white balance side of the same block is untouched.
		expect(getActionDefinitions(self).whiteBalanceExecAWB).toBeDefined()
		expect(getFeedbackDefinitions(self).awbResultOk).toBeDefined()
		expect(getFeedbackDefinitions(self).awbResultNg).toBeDefined()
		expect(getPresetDefinitions(self).presets['image-awb']).toBeDefined()
	})

	// The reading follows the balance command, not the notification channel: a camera that cannot push —
	// the camcorders are the case in point — still answers a failed run with ER3 in the reply, and where
	// it reports nothing the variable simply stays empty rather than the entry going missing.
	it('offers the balance result even on a camera that cannot push updates', () => {
		const self = mockInstance('AG-CX350')

		expect(seriesSpec('CX350').capabilities.subscription).toBe(false)
		expect(getFeedbackDefinitions(self).awbResultOk).toBeDefined()
		expect(getFeedbackDefinitions(self).abbResultOk).toBeDefined()
		expect(setVariables(self).awbResult).toBeDefined()
		expect(getActionDefinitions(self).whiteBalanceExecAWB).toBeDefined()
	})

	// Nothing has been reported yet, so neither feedback may claim a verdict.
	it('leaves both balance feedbacks dark until the camera reports something', () => {
		const feedbacks = getFeedbackDefinitions(mockInstance('AW-UE150'))

		expect(feedbacks.awbResultOk.callback({})).toBe(false)
		expect(feedbacks.awbResultNg.callback({})).toBe(false)
	})

	// The movement range limit needs a pan/tilt head, so the box cameras and the camcorder cannot have
	// it, and the AW-UE4 is the one PT model the compatible model table marks --- for #LC.
	it.each(['UB300', 'UB50', 'UBX100', 'CX350', 'UE4', 'UE5', 'HE2'])('%s claims no movement range limit', (id) => {
		expect(SERIES_SPECS.find((s) => s.id === id).capabilities.panTiltLimit).toBe(false)
	})

	// The camera fault state is a bitmask, so the capability has to name both the command that carries
	// it and what each bit means - QSI:46 has five, the older QER two. A missing bits list would render
	// the variable as an empty string on a camera that is in fact reporting a fault.
	const FAULTY = SERIES_SPECS.filter((s) => s.capabilities.errorCamera).map((s) => ({
		series: s.id,
		cap: s.capabilities.errorCamera,
	}))

	it('is a set worth checking', () => {
		expect(FAULTY.length).toBeGreaterThan(10)
	})

	it.each(FAULTY)('$series names the command and the bits behind its camera error', ({ cap }) => {
		expect(['QER', 'QSI:46']).toContain(cap.cmd)
		expect(Array.isArray(cap.bits)).toBe(true)
		expect(cap.bits.length).toBeGreaterThan(0)
		expect(cap.bits.length).toBeLessThanOrEqual(cap.cmd === 'QER' ? 2 : 5)
		for (const bit of cap.bits) expect(bit).toBeTypeOf('string')
	})

	// The AW-UE20/HE20, AW-UE4 and AW-HE2 have no #RER at all. They carried error: true anyway, and
	// since the feedback only compared against '00', a data.error left at null read as a fault - the
	// indicator sat lit for the life of the connection.
	it.each(['UE20', 'UE4', 'HE2'])('%s claims no rER it cannot answer', (id) => {
		const caps = SERIES_SPECS.find((s) => s.id === id).capabilities
		const ptz = [caps.poll, caps.pull].filter(Boolean).flatMap((l) => l.ptz || [])

		expect(caps.error).toBe(false)
		expect(ptz).not.toContain('RER')
	})

	// The CX350 spec has no QSI:18, no #LPI and no #AXZ, so the lens positions have exactly one source.
	it('reads the CX350 lens positions the only way its own spec offers', () => {
		const poll = SERIES_SPECS.find((s) => s.id === 'CX350').capabilities.poll

		expect(poll.ptz).toEqual(['GF', 'GI', 'GZ'])
		expect(poll.cam).not.toContain('QSI:18')
	})
})

// The web endpoints live in the "Supplement for WEB Control" documents rather than the interface
// specifications, and nothing pushes them — a stream that is started elsewhere only shows up if its
// status is polled. So the capability and the poll entry have to travel together in both directions:
// a capability without its query leaves the variable dead, a query without its capability asks a
// camera for something the documents say it does not have.
describe('web capability coverage', () => {
	const PAIRS = [
		['streamRTMP', 'get_rtmp_status'],
		['streamSRT', 'get_srt_status'],
		['streamTS', 'get_ts_status'],
		['recordSD', 'get_state'],
	]

	// The AG-CX350 documents rtmp_ctrl and srt_ctrl but no status query for either, so it can start and
	// stop a stream while never learning what state it is in.
	const NO_STATUS_QUERY = { CX350: ['streamRTMP', 'streamSRT'] }

	const webOf = (spec) => new Set([spec.capabilities.poll, spec.capabilities.pull].flatMap((l) => (l && l.web) || []))

	const CASES = SERIES_SPECS.flatMap((spec) =>
		PAIRS.map(([capability, query]) => ({
			series: spec.id,
			capability,
			query,
			declared: !!spec.capabilities[capability],
			web: webOf(spec),
		})),
	)

	// `Other` is the unknown-camera fallback and declares everything; it polls nothing on the web.
	const NEEDS_QUERY = CASES.filter(
		(c) => c.declared && c.series !== 'Other' && !NO_STATUS_QUERY[c.series]?.includes(c.capability),
	)
	const NEEDS_NONE = CASES.filter((c) => !c.declared)

	it('is a set worth checking', () => {
		expect(NEEDS_QUERY.length).toBeGreaterThan(15)
		expect(NEEDS_NONE.length).toBeGreaterThan(50)
	})

	it.each(NEEDS_QUERY)('$series polls $query for its $capability', ({ web, query }) => {
		expect(web.has(query)).toBe(true)
	})

	it.each(NEEDS_NONE)('$series does not poll $query, having no $capability', ({ web, query }) => {
		expect(web.has(query)).toBe(false)
	})

	// The HE130/HR140 restart is documented in a shape this module cannot send: /cgi-bin/initial is
	// POST-only there and takes no Randomnum, while getWeb only ever does GET.
	it.each(['HE130', 'HR140'])('%s offers no restart it could not carry out', (id) => {
		expect(SERIES_SPECS.find((s) => s.id === id).capabilities.restart).toBe(false)
	})

	// Those two have no view.cgi either, but they do have a one-shot — on /cgi-bin/camera. getImage()
	// builds its URL straight out of this, so a missing `cmd` would put the string "undefined" in the
	// request and only show up against a real camera.
	const IMAGING = SERIES_SPECS.filter((s) => s.capabilities.imageTransmission).map((s) => ({
		series: s.id,
		image: s.capabilities.imageTransmission,
	}))

	it('is a set worth checking', () => {
		expect(IMAGING.length).toBeGreaterThan(10)
	})

	it.each(IMAGING)('$series names the endpoint its one-shot lives on', ({ image }) => {
		expect(image.cmd).toBeTypeOf('string')
		expect(image.cmd).not.toBe('')
		expect(image.cmd.startsWith('/')).toBe(false) // joined onto /cgi-bin/ by getImage()
	})

	it.each(['HE130', 'HR140'])('%s fetches its one-shot from /cgi-bin/camera, not view.cgi', (id) => {
		const image = SERIES_SPECS.find((s) => s.id === id).capabilities.imageTransmission

		// Its spec shows no call with the parameters left off, so the resolution has to be named.
		expect(image.cmd).toMatch(/^camera\?resolution=\d+$/)
	})
})

describe.each(MODELS_BY_SERIES)('series $series (via $id)', ({ id, series }) => {
	const self = mockInstance(id)
	const caps = seriesSpec(series).capabilities

	const { structure, presets } = getPresetDefinitions(self)
	const actions = getActionDefinitions(self)
	const feedbacks = getFeedbackDefinitions(self)
	const variables = setVariables(self)

	const allFields = [...Object.entries(actions), ...Object.entries(feedbacks)].flatMap(([defId, def]) =>
		(def.options ?? []).map((field) => [defId, field]),
	)

	describe('presets', () => {
		it('only emits `layered` presets, with no leftover 1.x properties', () => {
			for (const [presetId, preset] of Object.entries(presets)) {
				expect(preset.type, presetId).toBe('layered')
				// `style` is the legacy shape: Companion would rescale its `size` on import, which is what
				// moving to elements got rid of. A preset carrying both would be half-converted.
				expect(preset, presetId).not.toHaveProperty('style')
				expect(preset, presetId).not.toHaveProperty('previewStyle')
				expect(preset, presetId).not.toHaveProperty('category')
				expect(preset, presetId).not.toHaveProperty('template')
				for (const prop of REMOVED_PRESET_OPTIONS) {
					expect(preset.options ?? {}, `${presetId}.options.${prop}`).not.toHaveProperty(prop)
				}
			}
		})

		it('draws every button from the same three elements', () => {
			for (const [presetId, preset] of Object.entries(presets)) {
				expect(
					preset.elements?.map((el) => el.id),
					presetId,
				).toEqual(['box0', 'image0', 'text0'])
			}
		})

		// The whole point of the move: fontsize is a percentage of the element, 3-200 per Companion's own
		// field. A legacy pixel size (7/14/18/…) would land in range and read as a tiny font instead of
		// being rejected, so the lower bound is the module's own smallest, not Companion's.
		it('sizes text in percent, not in the pixel heights the host used to rescale', () => {
			for (const [presetId, preset] of Object.entries(presets)) {
				const text = preset.elements.find((el) => el.type === 'text')

				expect(typeof text.fontsize, `${presetId}.fontsize`).toBe('number')
				expect(text.fontsize, `${presetId}.fontsize`).toBeGreaterThanOrEqual(20)
				expect(text.fontsize, `${presetId}.fontsize`).toBeLessThanOrEqual(200)
			}
		})

		// A picture reaches a layered element as a data URL. Only the legacy path wrapped bare base64 for
		// us, so an icon handed over raw would silently draw nothing.
		it('hands every picture over as a data URL', () => {
			const images = Object.entries(presets).flatMap(([presetId, preset]) => [
				...preset.elements
					.filter((el) => el.type === 'image' && el.base64Image)
					.map((el) => [presetId, el.base64Image]),
				...(preset.feedbacks ?? []).flatMap((fb) =>
					(fb.styleOverrides ?? [])
						.filter((o) => o.elementProperty === 'base64Image' && o.override.value !== 'png64')
						.map((o) => [presetId, o.override.value]),
				),
			])

			for (const [presetId, image] of images) {
				expect(image, `${presetId} image`).toMatch(/^data:image\/\w+;base64,/)
			}
		})

		it('references every preset from exactly one section, and nothing dangling', () => {
			const referenced = []
			for (const section of structure) {
				expect(section.id, section.name).toBeTruthy()
				for (const entry of section.definitions) {
					// A section holds either bare preset ids or groups, never a mix of the two.
					referenced.push(...(typeof entry === 'string' ? [entry] : (entry.presets ?? [entry.presetId])))
				}
			}
			expect([...referenced].sort()).toEqual(Object.keys(presets).sort())
		})

		it('never mixes bare preset ids and groups within one section', () => {
			for (const section of structure) {
				const kinds = new Set(section.definitions.map((d) => typeof d === 'string'))
				expect(kinds.size, `section ${section.id}`).toBeLessThanOrEqual(1)
			}
		})
	})

	// A layered feedback carries no style, it names the element properties it overrides. Companion is
	// unforgiving about the shape and silent about rejecting it: an override that is not an
	// ExpressionOrValue is dropped, and a feedback left with none of them is dropped along with it. A
	// feedback that quietly stops lighting the button is exactly the kind of thing that only shows up on
	// hardware, so it is checked here.
	describe('preset feedback style overrides', () => {
		const feedbackOverrides = Object.entries(presets).flatMap(([presetId, preset]) =>
			(preset.feedbacks ?? []).map((fb) => ({ presetId, feedbackId: fb.feedbackId, preset, fb })),
		)

		it('is a set worth checking', () => {
			expect(feedbackOverrides.length).toBeGreaterThan(3)
		})

		it.each(feedbackOverrides)('$presetId: $feedbackId overrides something', ({ fb }) => {
			expect(fb).not.toHaveProperty('style')
			expect(fb.styleOverrides?.length ?? 0).toBeGreaterThan(0)
		})

		it.each(feedbackOverrides)('$presetId: $feedbackId wraps every override value', ({ fb }) => {
			for (const override of fb.styleOverrides) {
				expect(override.override, override.elementProperty).toHaveProperty('isExpression')
				expect(typeof override.override.isExpression, override.elementProperty).toBe('boolean')
			}
		})

		it.each(feedbackOverrides)('$presetId: $feedbackId points at elements that exist', ({ preset, fb }) => {
			const ids = preset.elements.map((el) => el.id)

			for (const override of fb.styleOverrides) {
				expect(ids, `${fb.feedbackId}.${override.elementProperty}`).toContain(override.elementId)
			}
		})
	})

	describe('preset entities', () => {
		// Companion parses every stored option against its definition with no default fallback, so a
		// preset button is only as valid as its weakest option: an omitted option, an out-of-step value,
		// or an action the model lacks each takes the whole button down.
		const presetEntities = Object.entries(presets).flatMap(([presetId, preset]) => [
			...(preset.steps ?? []).flatMap((step) =>
				Object.values(step)
					.filter(Array.isArray)
					.flatMap((set) => set.map((action) => [presetId, 'action', action.actionId, action.options, actions])),
			),
			...(preset.feedbacks ?? []).map((fb) => [presetId, 'feedback', fb.feedbackId, fb.options, feedbacks]),
		])

		it('only references actions and feedbacks this model actually has', () => {
			for (const [presetId, kind, entityId, , definitions] of presetEntities) {
				expect(definitions[entityId], `${presetId} uses ${kind} ${entityId}`).toBeDefined()
			}
		})

		it('carries no option the model does not have', () => {
			// A preset is written once for every model, so it can name an option a given model's action lacks.
			for (const [presetId, kind, entityId, options, definitions] of presetEntities) {
				const known = (definitions[entityId]?.options ?? []).map((field) => field.id)
				for (const id of Object.keys(options ?? {})) {
					expect(known, `${presetId}: ${kind} ${entityId} has no option ${id}`).toContain(id)
				}
			}
		})

		it('gives every option of every preset entity a value its own definition accepts', () => {
			for (const [presetId, kind, entityId, options, definitions] of presetEntities) {
				for (const field of definitions[entityId]?.options ?? []) {
					if (field.type === 'static-text') continue
					const value = options?.[field.id]
					const where = `${presetId}: ${kind} ${entityId}.${field.id}`

					expect(value, `${where} is not set`).toBeDefined()
					// An expression is only resolved on the button, so there is nothing to check here.
					if (value?.isExpression) continue

					if (field.type === 'dropdown') {
						expect(
							field.choices.map((c) => c.id),
							where,
						).toContain(value)
					}
					if (field.type === 'number') {
						expect(value, where).toBeGreaterThanOrEqual(field.min ?? -Infinity)
						expect(value, where).toBeLessThanOrEqual(field.max ?? Infinity)
					}
				}
			}
		})
	})

	describe('preset templates', () => {
		const templates = structure.flatMap((s) => s.definitions.filter((d) => d.type === 'template'))

		it('fans preset memory out over the slots this model actually has', () => {
			if (!caps.preset) return expect(templates.find((t) => t.presetId === 'preset-memory')).toBeUndefined()

			const template = templates.find((t) => t.presetId === 'preset-memory')
			expect(template).toBeDefined()
			// The old hardcoded loop always emitted 100 buttons, even on a 9-preset camera.
			expect(template.templateValues).toHaveLength(caps.preset)
			expect(template.templateValues.at(0).value).toBe(1)
			expect(template.templateValues.at(-1).value).toBe(caps.preset)
		})

		it('declares a local variable for every templated variable name', () => {
			for (const template of templates) {
				const names = (presets[template.presetId].localVariables ?? []).map((v) => v.variableName)
				expect(names, template.id).toContain(template.templateVariableName)
			}
		})
	})

	describe('option fields', () => {
		it('uses only field types that module-base 2.x knows', () => {
			for (const [defId, field] of allFields) {
				expect(FIELD_TYPES, `${defId}.${field.id}`).toContain(field.type)
			}
		})

		it('carries no properties that were removed in 2.0', () => {
			for (const [defId, field] of allFields) {
				for (const prop of REMOVED_FIELD_PROPS) {
					expect(field, `${defId}.${field.id}`).not.toHaveProperty(prop)
				}
			}
		})

		it('builds no "Use Variable" companion field, because every field can be one', () => {
			for (const [defId, field] of allFields) {
				expect(REMOVED_OPTION_IDS, `${defId} still declares ${field.id}`).not.toContain(field.id)
			}
		})

		it('lets every field the callbacks constrain hold what an expression produced', () => {
			// resolveSetStep and parsePresetNumber clamp these themselves; without `allowInvalidValues`
			// Companion drops the entity first. The preset dropdown hits this normally: templated buttons
			// drive it from an expression yielding the number 4, where the choice ids are '00'..'99'.
			const constrained = allFields.filter(([, field]) => isConstrained(field))
			expect(constrained.length).toBeGreaterThan(0)

			for (const [defId, field] of constrained) {
				expect(field.allowInvalidValues, `${defId}.${field.id}`).toBe(true)
			}
		})

		it('lets every conditionally-visible field hold an empty value', () => {
			// Companion validates a stored option whether or not the field is shown. A field behind an
			// isVisibleExpression is legitimately empty while its condition is off, so any rule rejecting
			// "" makes the whole entity fail to parse. In 2.0 `minLength` and `regex` are enforced (they
			// were advisory in 1.x), so carrying them over broke saved buttons driven from the dropdown.
			for (const [defId, field] of allFields) {
				if (!field.isVisibleExpression) continue
				const where = `${defId}.${field.id} is only shown when ${field.isVisibleExpression}`

				expect(field.minLength ?? 0, where).toBe(0)
				if (field.regex) {
					const body = field.regex.slice(1, field.regex.lastIndexOf('/'))
					const flags = field.regex.slice(field.regex.lastIndexOf('/') + 1)
					expect(new RegExp(body, flags).test(''), `${where}, but its regex rejects an empty value`).toBe(true)
				}
			}
		})

		it('only lets isVisibleExpression read fields that opted out of auto-expression', () => {
			for (const [defId, def] of [...Object.entries(actions), ...Object.entries(feedbacks)]) {
				for (const field of def.options ?? []) {
					if (typeof field.isVisibleExpression !== 'string') continue
					const referenced = [...field.isVisibleExpression.matchAll(/\$\(options:(\w+)\)/g)].map((m) => m[1])
					for (const name of referenced) {
						// A field that can hold an expression cannot be read back reliably, so anything an
						// isVisibleExpression depends on must set disableAutoExpression.
						const target = def.options.find((o) => o.id === name)
						expect(target, `${defId}.${field.id} -> ${name}`).toBeDefined()
						expect(target.disableAutoExpression, `${defId}.${field.id} -> ${name}`).toBe(true)
					}
				}
			}
		})
	})

	// `pull` is only read when the subscription is off, so it may only carry what the camera pushes.
	// Iris Follow is the counter-example: its Update notification column is empty in every spec that
	// carries it, and it shipped in `pull` — so a subscribed connection read it once from camdata.html
	// at init and reported that same value for the life of the connection.
	describe('the iris follow position', () => {
		it('is polled rather than pulled, because the camera never reports it again', () => {
			if (!caps.irisFollowPosition) return

			expect(caps.pull?.cam || [], series).not.toContain('QSD:4F')
		})

		// The AW-HE2 has no QSD:4F at all; it pushes OSD:4F instead, so it neither polls nor pulls.
		it('is queried on every model that answers a query for it', () => {
			if (!caps.irisFollowPosition || series === 'HE2' || series === 'Other') return

			expect(caps.poll?.cam || [], series).toContain('QSD:4F')
		})
	})

	// OSJ:D2 is read-only — the camera has no control command for it — and reports the filter in place,
	// which is never "Auto". Only the two models whose specs carry it may publish it at all.
	describe('the ND filter follow status', () => {
		it('is offered only where the camera reports it, and always beside the setting', () => {
			if (!caps.filterFollow) return

			expect(['UE80', 'UR100'], series).toContain(series)
			expect(caps.filter, series).toBeTruthy()
			expect(
				caps.filterFollow.dropdown.map((c) => c.id),
				series,
			).toEqual(['0', '1', '2', '3'])
		})

		it('is queried wherever it is declared, or the variable would never fill', () => {
			if (!caps.filterFollow) return

			const cam = [...(caps.pull?.cam || []), ...(caps.poll?.cam || [])] // `cam` is false, not absent, where unused
			expect(cam, series).toContain('QSJ:D2')
		})

		it('is not queried where it is not declared', () => {
			if (caps.filterFollow) return

			const cam = [...(caps.pull?.cam || []), ...(caps.poll?.cam || [])] // `cam` is false, not absent, where unused
			expect(cam, series).not.toContain('QSJ:D2')
		})
	})

	describe('feedbacks', () => {
		it('gives every boolean feedback a defaultStyle and drops the removed subscribe hook', () => {
			for (const [feedbackId, def] of Object.entries(feedbacks)) {
				expect(['boolean', 'advanced', 'value'], feedbackId).toContain(def.type)
				if (def.type === 'boolean') expect(def.defaultStyle, feedbackId).toBeDefined()
				expect(def, feedbackId).not.toHaveProperty('subscribe')
			}
		})

		// An advanced feedback returns its style at runtime, so Companion cannot infer what it touches.
		// Left undeclared it warns at every init and then offers the user an override for every style
		// property there is, most of which this feedback will never set.
		const STYLE_PROPERTIES = ['text', 'size', 'color', 'bgcolor', 'alignment', 'pngalignment', 'png64', 'imageBuffer']

		it('tells Companion which style properties each advanced feedback overrides', () => {
			for (const [feedbackId, def] of Object.entries(feedbacks)) {
				if (def.type !== 'advanced') continue

				expect(def.affectedProperties, feedbackId).toBeInstanceOf(Array)
				expect(def.affectedProperties, feedbackId).not.toHaveLength(0)
				for (const property of def.affectedProperties) {
					expect(STYLE_PROPERTIES, feedbackId).toContain(property)
				}
			}
		})
	})

	describe('variables', () => {
		it('is keyed by variableId rather than being a 1.x array', () => {
			expect(Array.isArray(variables)).toBe(false)
			for (const [variableId, def] of Object.entries(variables)) {
				expect(def.name, variableId).toBeTypeOf('string')
				expect(def, variableId).not.toHaveProperty('variableId')
			}
		})
	})

	// The Iris preset writes a variable name into its button text, and nothing validates a name in free
	// text - a model that does not publish it just renders an empty line. So the name it picks has to
	// follow the capability: Iris Follow where the camera reports the lens's own position, the
	// commanded one everywhere else.
	// A variable name in a button's text element is free text — Companion validates nothing and a name
	// this model does not publish simply renders as an empty line. That is how the Iris preset's bar
	// sat blank on every box camera for years: those fill a field the preset did not name.
	const buttonText = (preset) => preset.elements.find((el) => el.type === 'text').text

	describe('preset button text', () => {
		const named = Object.entries(presets).flatMap(([presetId, preset]) =>
			[...buttonText(preset).matchAll(/\$\(generic-module:(\w+)\)/g)].map((m) => ({
				presetId,
				variable: m[1],
			})),
		)

		it('is a set worth checking', () => {
			expect(named.length).toBeGreaterThan(5)
		})

		it.each(named)('$presetId names $variable, which this model publishes', ({ presetId, variable }) => {
			expect(variables, `${presetId}: ${variable}`).toHaveProperty(variable)
		})
	})

	// A camera reports faults on rER, on QER/QSI:46, or on both, and the info button has to light up
	// whichever it is. Gated on rER alone it left the box cameras out entirely: no button at all on the
	// AK-UB50 and AK-UB300, and one on the AK-UBX100 that could never light.
	describe('the camera info preset', () => {
		const info = presets['system-cam-info']

		it.runIf(caps.error || caps.errorCamera)('exists wherever a fault can be reported', () => {
			expect(info).toBeDefined()
		})

		it.runIf(caps.error || caps.errorCamera)('carries the error feedback', () => {
			expect(info.feedbacks.map((f) => f.feedbackId)).toContain('error')
		})
	})

	describe('the iris preset readout', () => {
		const iris = presets['exposure-iris']

		it.runIf(iris)('shows the lens position itself wherever the camera reports it', () => {
			const wanted = caps.irisFollowPosition ? 'irisFollowPosition' : 'irisPosition'

			expect(buttonText(iris)).toContain(`$(generic-module:${wanted}Bar)`)
		})
	})
})
