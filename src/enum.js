// Arithmetic tables are generated, not enumerated; src/__tests__/enum.test.js pins the output.

const hex = (n, width) => n.toString(16).toUpperCase().padStart(width, '0')

const range = (from, to, step = 1) => {
	const out = []
	for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i)
	return out
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

// hex step: 0 dB = 0x08; 0x80/0x81 = auto/manual
const gain = (lowDb, highDb, stepDb = 1, { auto = true, manual = false } = {}) => [
	...(auto ? [{ id: '80', label: 'Auto' }] : []),
	...range(lowDb, highDb, stepDb).map((db) => ({ id: hex(db + 8, 2), label: `${db} dB` })),
	...(manual ? [{ id: '81', label: 'Manual' }] : []),
]

// percentage centred on 0x80, plus optional OFF.
const chromaPercent = (lowPct, highPct, { off = true } = {}) => [
	...(off ? [{ id: '00', label: 'OFF' }] : []),
	...range(lowPct, highPct).map((pct) => ({ id: hex(pct + 0x80, 2), label: `${signed(pct)}%` })),
]

// discrete steps centred on 0x03
const chromaSteps = (low, high) => range(low, high).map((v) => ({ id: hex(v + 3, 2), label: signed(v) }))

// signed steps centred on an arbitrary hex origin, 0x80 being the usual one
const centeredSteps = (low, high, center = 0x80) =>
	range(low, high).map((v) => ({ id: hex(v + center, 2), label: signed(v) }))

// speed n -> 250 + 25n, capped at 999
const presetSpeeds = () => [
	{ id: '000', label: 'Speed Max' },
	...range(30, 1, -1).map((s) => ({
		id: String(Math.min(250 + 25 * s, 999)),
		label: `Speed ${String(s).padStart(2, ' ')}`,
	})),
]

// whole seconds, sent as hex
const presetTimes = () => range(99, 1, -1).map((t) => ({ id: hex(t, 3), label: `Time ${String(t).padStart(2, ' ')}s` }))

// HE130 colour temps: irregular grid, kept as data; ids generated.
// prettier-ignore
const COLOR_TEMPERATURE_NL = [
	2000, 2010, 2020, 2040, 2050, 2070, 2080, 2090, 2110, 2120, 2140, 2150, 2170, 2180, 2200, 2210, 2230, 2240, 2260, 2280,
	2300, 2310, 2330, 2340, 2360, 2380, 2400, 2420, 2440, 2460, 2480, 2500, 2520, 2540, 2560, 2600, 2620, 2640, 2680, 2700,
	2720, 2740, 2780, 2800, 2820, 2850, 2870, 2920, 2950, 2970, 3000, 3020, 3070, 3100, 3120, 3150, 3200, 3250, 3270, 3330,
	3360, 3420, 3450, 3510, 3570, 3600, 3660, 3720, 3780, 3840, 3870, 3930, 3990, 4050, 4110, 4170, 4240, 4320, 4360, 4440,
	4520, 4600, 4680, 4760, 4840, 4920, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5750, 5850, 6000, 6150, 6300, 6450, 6650,
	6800, 7000, 7150, 7400, 7600, 7800, 8100, 8300, 8600, 8900, 9200, 9600, 10000, 10500, 11000, 11500, 12000, 12500, 13000,
	14000, 15000,
]

// POVCAM colour temps: the same 121-step grid as the HE130, but 14 of the values differ.
// prettier-ignore
const COLOR_TEMPERATURE_POVCAM = [
	2000, 2010, 2020, 2040, 2050, 2070, 2080, 2090, 2110, 2120, 2140, 2150, 2170, 2180, 2200, 2210, 2230, 2250, 2260, 2280,
	2300, 2310, 2330, 2350, 2360, 2380, 2400, 2420, 2440, 2460, 2480, 2500, 2520, 2540, 2560, 2600, 2620, 2640, 2680, 2700,
	2720, 2740, 2780, 2800, 2825, 2850, 2875, 2900, 2950, 2975, 3000, 3025, 3075, 3100, 3125, 3175, 3200, 3250, 3275, 3330,
	3360, 3420, 3450, 3510, 3570, 3600, 3660, 3720, 3780, 3840, 3870, 3930, 3990, 4050, 4110, 4170, 4240, 4320, 4360, 4440,
	4520, 4600, 4680, 4760, 4840, 4920, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5750, 5850, 6000, 6150, 6300, 6450, 6650,
	6800, 7000, 7200, 7400, 7600, 7850, 8100, 8400, 8600, 8900, 9200, 9600, 10000, 10500, 11000, 11500, 12000, 12500, 13000,
	14000, 15000,
]

const VIDEO_FORMAT = [
	{ id: '00', label: '720/60p' },
	{ id: '01', label: '720/59.94p' },
	{ id: '02', label: '720/50p' },
	{ id: '03', label: '1080/60i' },
	{ id: '04', label: '1080/59.94i' },
	{ id: '05', label: '1080/50i' },
	{ id: '07', label: '1080/29.97PsF' },
	{ id: '08', label: '1080/25PsF' },
	{ id: '0A', label: '1080/23.98PsF' },
	{ id: '0B', label: '480/59.94i' },
	{ id: '0D', label: '576/50i' },
	{ id: '10', label: '1080/59.94p' },
	{ id: '11', label: '1080/50p' },
	{ id: '12', label: '480/59.94p' },
	{ id: '13', label: '576/50p' },
	{ id: '14', label: '1080/29.97p' },
	{ id: '15', label: '1080/25p' },
	{ id: '16', label: '1080/23.98p (59.94i)' },
	{ id: '17', label: '2160/29.97p' },
	{ id: '18', label: '2160/25p' },
	{ id: '19', label: '2160/59.94p' },
	{ id: '1A', label: '2160/50p' },
	{ id: '1B', label: '2160/23.98p' },
	{ id: '1C', label: '2160/29.97PsF' },
	{ id: '1D', label: '2160/25PsF' },
	{ id: '1E', label: '2160/23.98PsF' },
	{ id: '1F', label: '2160/60p' },
	{ id: '20', label: '1080/60p' },
	{ id: '21', label: '2160/24p' },
	{ id: '22', label: '1080/24p' },
	{ id: '23', label: '1080/23.98p' },
	{ id: '24', label: '2160/30p' },
	{ id: '25', label: '1080/30p' },
	{ id: '26', label: '1080/119.88p' },
	{ id: '27', label: '1080/100p' },
	{ id: '44', label: '1080/59.94i CROP' },
	{ id: '45', label: '1080/50i CROP' },
	{ id: '50', label: '1080/59.94p CROP' },
	{ id: '51', label: '1080/50p CROP' },
	{ id: '80', label: 'Auto' },
	{ id: '90', label: '3328x2496/59.94p' },
	{ id: '91', label: '3328x2496/50p' },
	{ id: '92', label: '3328x2496/48p' },
	{ id: '93', label: '3328x2496/47.95p' },
	{ id: '94', label: '3328x2496/29.97p' },
	{ id: '95', label: '3328x2496/25p' },
	{ id: '96', label: '3328x2496/24p' },
	{ id: '97', label: '3328x2496/23.98p' },
	{ id: '98', label: '4096x2160/59.94p' },
	{ id: '99', label: '4096x2160/50p' },
	{ id: '9A', label: '4096x2160/48p' },
	{ id: '9B', label: '4096x2160/47.95p' },
	{ id: '9C', label: '4096x2160/29.97p' },
	{ id: '9D', label: '4096x2160/25p' },
	{ id: '9E', label: '4096x2160/24p' },
	{ id: '9F', label: '4096x2160/23.98p' },
	{ id: 'A0', label: '3680x2760/59.94p' },
	{ id: 'A1', label: '3680x2760/50p' },
	{ id: 'A2', label: '3680x2760/29.97p' },
	{ id: 'A3', label: '3680x2760/25p' },
	{ id: 'A4', label: '3680x2760/23.98p' },
	{ id: 'A5', label: '4128x2176/59.94p' },
	{ id: 'A6', label: '4128x2176/50p' },
	{ id: 'A7', label: '4128x2176/29.97p' },
	{ id: 'A8', label: '4128x2176/25p' },
	{ id: 'A9', label: '4128x2176/23.98p' },
	{ id: 'AA', label: '3536x2656/50p' },
	{ id: 'AB', label: '3536x2656/29.97p' },
	{ id: 'AC', label: '3536x2656/25p' },
	{ id: 'AD', label: '3536x2656/23.98p' },
	{ id: 'AE', label: '5888x3312/29.97p' },
	{ id: 'AF', label: '5888x3312/25p' },
	{ id: 'B0', label: '5888x3312/24p' },
	{ id: 'B1', label: '5888x3312/23.98p' },
	{ id: 'B2', label: '5376x3584/29.97p' },
	{ id: 'B3', label: '5376x3584/25p' },
	{ id: 'B4', label: '5952x3968/24p' },
	{ id: 'B5', label: '5952x3968/23.98p' },
	{ id: 'B6', label: '1080/48p' },
	{ id: 'B7', label: '1080/47.95p' },
	{ id: 'B8', label: '2160/48p' },
	{ id: 'B9', label: '2160/47.95p' },
]

// A model's formats, grouped by the system frequency they belong to. The camera refuses a value from
// another group with ER3, so the groups are kept apart here and concatenated in that order: stepping
// through the action then walks one frequency at a time and only crosses at a group boundary.
const formats = (...groups) =>
	groups.flat().map((id) => {
		const format = VIDEO_FORMAT.find((f) => f.id === id)
		if (!format) throw new Error(`unknown video format id ${id}`)
		return format
	})

// The five system frequencies (OSE:77). Every model supports 59.94Hz and 50Hz; the rest is a subset.
const FREQUENCY = [
	{ id: '0', label: '59.94 Hz' },
	{ id: '1', label: '50.00 Hz' },
	{ id: '2', label: '24.00 Hz' },
	{ id: '3', label: '23.98 Hz' },
	{ id: '4', label: '60.00 Hz' },
]

const frequencies = (...ids) => FREQUENCY.filter((f) => ids.includes(f.id))

export const e = {
	// ##########################
	// #### Generic Look Ups ####
	// ##########################
	ENUM_MAN_AUTO: [
		{ id: '0', label: 'Manual' },
		{ id: '1', label: 'Auto' },
	],

	ENUM_OFF_ON: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'ON' },
	],

	ENUM_PT_LIMIT: [
		{ id: '1', label: 'Tilt Up' },
		{ id: '2', label: 'Tilt Down' },
		{ id: '3', label: 'Pan Left' },
		{ id: '4', label: 'Pan Right' },
	],

	ENUM_STOP_START: [
		{ id: '0', label: 'Stop' },
		{ id: '1', label: 'Start' },
	],

	// #######################
	// #### Gain Look Ups ####
	// #######################
	ENUM_GAIN_HE40: gain(0, 48, 3),
	ENUM_GAIN_HE50: gain(0, 18, 3),
	ENUM_GAIN_HE120: gain(0, 18),
	ENUM_GAIN_HE130: gain(0, 36),
	ENUM_GAIN_HR140: gain(0, 42),
	ENUM_GAIN_UE4: gain(0, 42, 3, { auto: false }),
	ENUM_GAIN_UE100: gain(0, 42),
	ENUM_GAIN_UE150: gain(-3, 42),
	ENUM_GAIN_CX350: gain(-6, 42, 1, { manual: true }),
	ENUM_GAIN_UE160: gain(-6, 12),
	ENUM_GAIN_UB50: gain(-6, 62, 1, { auto: false }),
	ENUM_GAIN_UBX100: gain(-6, 18, 3),
	ENUM_GAIN_POVCAM: gain(0, 30, 1),
	ENUM_GAIN_UB300: [
		{ id: '01', label: 'LOW' },
		{ id: '04', label: 'MID' },
		{ id: '08', label: 'HIGH' },
		{ id: '06', label: 'S.GAIN1' },
		{ id: '0C', label: 'S.GAIN2' },
		{ id: '0E', label: 'S.GAIN3' },
	],

	// ##########################
	// #### Shutter Look Ups ####
	// ##########################
	ENUM_SHUTTER_POVCAM: [
		{ id: '00', label: 'Auto' },
		{ id: '74', label: 'Step 1/2' },
		{ id: '75', label: 'Step 1/3 (23.98p, 50Hz only)' },
		{ id: '76', label: 'Step 1/4 (59.94Hz, 29.97p only)' },
		{ id: '77', label: 'Step 1/6 (23.98p, 50Hz only)' },
		{ id: '78', label: 'Step 1/8 (59.94Hz, 29.97p only)' },
		{ id: '79', label: 'Step 1/12 (23.98p, 50Hz only)' },
		{ id: '7A', label: 'Step 1/15 (59.94Hz, 29.97p only)' },
		{ id: '7B', label: 'Step 1/24 (23.98p only)' },
		{ id: '7C', label: 'Step 1/25 (50Hz only)' },
		{ id: '7D', label: 'Step 1/30 (59.94Hz, 29.97p only)' },
		{ id: '7E', label: 'Step 1/48 (23.98p only)' },
		{ id: '7F', label: 'Step 1/50 (29.97p, 23.98p, 50Hz only)' },
		{ id: '80', label: 'Step 1/60' },
		{ id: '81', label: 'Step 1/100' },
		{ id: '82', label: 'Step 1/120 (59.94Hz, 29.97p, 23.98p only)' },
		{ id: '83', label: 'Step 1/125 (50Hz only)' },
		{ id: '84', label: 'Step 1/180' },
		{ id: '85', label: 'Step 1/250' },
		{ id: '86', label: 'Step 1/350' },
		{ id: '87', label: 'Step 1/500' },
		{ id: '88', label: 'Step 1/750' },
		{ id: '89', label: 'Step 1/1000' },
		{ id: '8A', label: 'Step 1/1500' },
		{ id: '8B', label: 'Step 1/2000' },
		{ id: '8C', label: 'Step 1/3000' },
		{ id: '8D', label: 'Step 1/4000' },
		{ id: '8E', label: 'Step 1/8000' },
		{ id: 'FF', label: 'Syncro Scan' },
	],
	ENUM_SHUTTER_HE40: [
		{ id: '0', label: 'OFF' },
		{ id: '3', label: 'Step 1/100 (59.94Hz) or 1/120 (50Hz)' },
		{ id: '5', label: 'Step 1/250' },
		{ id: '6', label: 'Step 1/500' },
		{ id: '7', label: 'Step 1/1000' },
		{ id: '8', label: 'Step 1/2000' },
		{ id: '9', label: 'Step 1/4000' },
		{ id: 'A', label: 'Step 1/10000' },
		{ id: 'B', label: 'Syncro Scan' },
	],
	ENUM_SHUTTER_HE120: [
		{ id: '0', label: 'OFF' },
		{ id: '3', label: 'Step 1/100 (59.94Hz) or 1/120 (50Hz)' },
		{ id: '5', label: 'Step 1/250' },
		{ id: '6', label: 'Step 1/500' },
		{ id: '7', label: 'Step 1/1000' },
		{ id: '8', label: 'Step 1/2000' },
		{ id: '9', label: 'Step 1/4000' },
		{ id: 'A', label: 'Step 1/10000' },
		{ id: 'B', label: 'Syncro Scan' },
		{ id: 'C', label: 'ELC' },
	],
	ENUM_SHUTTER_HE130: [
		{ id: '0', label: 'OFF' },
		{ id: '2', label: 'Step 1/60' },
		{ id: '3', label: 'Step 1/100' },
		{ id: '4', label: 'Step 1/120' },
		{ id: '5', label: 'Step 1/250' },
		{ id: '6', label: 'Step 1/500' },
		{ id: '7', label: 'Step 1/1000' },
		{ id: '8', label: 'Step 1/2000' },
		{ id: '9', label: 'Step 1/4000' },
		{ id: 'A', label: 'Step 1/10000' },
		{ id: 'B', label: 'Syncro Scan' },
		{ id: 'C', label: 'ELC' },
		{ id: 'D', label: 'Step 1/24' },
		{ id: 'E', label: 'Step 1/25' },
		{ id: 'F', label: 'Step 1/30' },
	],
	ENUM_SHUTTER_UB300: [
		{ id: '00', label: '1/48' },
		{ id: '01', label: '1/50' },
		{ id: '02', label: '1/60' },
		{ id: '03', label: '1/96' },
		{ id: '04', label: '1/100' },
		{ id: '05', label: '1/120' },
		{ id: '06', label: '1/125' },
		{ id: '07', label: '1/250' },
		{ id: '08', label: '1/500' },
		{ id: '09', label: '1/1000' },
		{ id: '0A', label: '1/1500' },
		{ id: '0B', label: '1/2000' },
		{ id: '0C', label: '180.0 deg' },
		{ id: '0D', label: '172.8 deg' },
		{ id: '0E', label: '144.0 deg' },
		{ id: '0F', label: '120.0 deg' },
		{ id: '10', label: '90.0 deg' },
		{ id: '11', label: '45.0 deg' },
	],
	ENUM_SHUTTER_ADV: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'Step' },
		{ id: '2', label: 'Synchro Scan' },
		{ id: '3', label: 'ELC' },
	],
	ENUM_SHUTTER_ADV_UE20: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'Step' },
		{ id: '2', label: 'Synchro Scan' },
	],
	ENUM_SHUTTER_ADV_UE4: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'Step' },
	],

	// ############################
	// #### ND Filter Look Ups ####
	// ############################
	ENUM_FILTER_OTHER: [
		{ id: '0', label: 'Clear (Through)' },
		{ id: '1', label: '1/4 ND' },
		{ id: '2', label: '1/16 ND' },
		{ id: '3', label: '1/64 ND' },
		{ id: '4', label: '1/8 ND' },
		{ id: '8', label: 'AUTO ND' },
	],
	ENUM_FILTER_3A: [
		{ id: '0', label: 'Clear (Through)' },
		{ id: '1', label: '1/4 ND' },
		{ id: '2', label: '1/16 ND' },
		{ id: '3', label: '1/64 ND' },
		{ id: '8', label: 'AUTO ND' },
	],
	ENUM_FILTER_3: [
		{ id: '0', label: 'Clear (Through)' },
		{ id: '1', label: '1/4 ND' },
		{ id: '2', label: '1/16 ND' },
		{ id: '3', label: '1/64 ND' },
	],
	ENUM_FILTER_2: [
		{ id: '0', label: 'Clear (Through)' },
		{ id: '3', label: '1/64 ND' },
		{ id: '4', label: '1/8 ND' },
	],

	// ######################
	// #### OIS Look Ups ####
	// ######################
	ENUM_OIS_OTHER: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'ON' },
	],
	ENUM_OIS_HR140: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'OIS' },
		{ id: '2', label: 'Dynamic I.S. System' },
	],
	ENUM_OIS_UE100: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'OIS' },
		{ id: '2', label: 'Hybrid (STABLE)' },
		{ id: '3', label: 'Hybrid (PAN/TILT)' },
	],
	ENUM_OIS_UE160: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'OIS (STABLE)' },
		{ id: '2', label: 'OIS (PAN/TILT)' },
		{ id: '3', label: 'Hybrid (STABLE)' },
		{ id: '4', label: 'Hybrid (PAN/TILT)' },
	],
	ENUM_OIS_UE80: [
		{ id: '0', label: 'OFF' },
		{ id: '1', label: 'OIS (STABLE)' },
		{ id: '2', label: 'OIS (PAN/TILT)' },
	],

	// ###############################
	// #### Preset Speed Look Ups ####
	// ###############################
	ENUM_PRESET_SPEED_TIME: [...presetSpeeds(), ...presetTimes()],
	ENUM_PRESET_SPEED: presetSpeeds(),
	ENUM_PRESET_SPEED_TABLE_2: [
		{ id: '0', label: 'Slow' },
		{ id: '2', label: 'Fast' },
	],
	ENUM_PRESET_SPEED_UNIT: [
		{ id: '0', label: 'Speed' },
		{ id: '1', label: 'Time' },
	],

	// ####################################
	// #### Color Temperature Look Ups ####
	// ####################################
	ENUM_COLOR_TEMPERATURE_LINEAR: range(0, 75).map((i) => ({ id: hex(i, 3), label: `${2400 + i * 100}K` })),
	ENUM_COLOR_TEMPERATURE_NONLINEAR: COLOR_TEMPERATURE_NL.map((k, i) => ({ id: hex(i, 3), label: `${k}K` })),
	ENUM_COLOR_TEMPERATURE_POVCAM: COLOR_TEMPERATURE_POVCAM.map((k, i) => ({ id: hex(i, 3), label: `${k}K` })),

	// ###############################
	// #### Chroma Level Look Ups ####
	// ###############################
	ENUM_CHROMA_LEVEL_3: chromaSteps(-3, 3),
	ENUM_CHROMA_LEVEL_10: chromaSteps(0, 10),
	ENUM_CHROMA_PCT_40: chromaPercent(-99, 40),
	ENUM_CHROMA_PCT_99: chromaPercent(-99, 99),
	ENUM_CHROMA_PCT_UBX100: chromaPercent(-100, 80),
	ENUM_CHROMA_PCT_POVCAM: chromaPercent(-70, 30, { off: false }), // OSK:02, 0x3A..0x9E, no OFF step

	// ######################################
	// #### Dynamic Range Stretch (DRS) #####
	// ######################################
	ENUM_DRS: [
		{ id: '0', label: 'Off' },
		{ id: '1', label: 'Low' },
		{ id: '2', label: 'Mid' },
		{ id: '3', label: 'High' },
	],
	ENUM_DRS_OFF_LOW_HIGH: [
		{ id: '0', label: 'Off' },
		{ id: '1', label: 'Low' },
		{ id: '3', label: 'High' },
	],

	// #######################################
	// #### Digital Noise Reduction (DNR) ####
	// #######################################
	ENUM_DNR: [
		{ id: '00', label: 'Off' },
		{ id: '01', label: 'Low' },
		{ id: '02', label: 'High' },
	],
	ENUM_NR_LEVEL_7: centeredSteps(-7, 7), // OSK:05, 0x79..0x87 — a level, not the three-step table

	// ###############################
	// #### Video Format Look Ups ####
	// ###############################
	ENUM_VIDEO_FORMAT: VIDEO_FORMAT,

	ENUM_VIDEO_FORMAT_HE2: formats(
		['01', '04', '10', '12'], // 59.94Hz
		['02', '05', '11', '13'], // 50Hz
	),

	// HE40Series. The SDI models have neither 10h nor 11h; Auto is a control value only, never reported.
	ENUM_VIDEO_FORMAT_HE40: formats(
		['01', '04', '07', '10', '14'], // 59.94Hz
		['02', '05', '08', '11', '15'], // 50Hz
		['80'], // Auto — listed under both frequencies, so it belongs to neither group
	),

	// AW-HE50 + AW-HE60, union over their H/S/N/E,MC sub-models.
	ENUM_VIDEO_FORMAT_HE50: formats(
		['01', '04', '07', '0B', '10', '12'], // 59.94Hz
		['02', '05', '08', '0D', '11', '13'], // 50Hz
	),

	ENUM_VIDEO_FORMAT_HE120: formats(
		['01', '04', '0B', '10', '12'], // 59.94Hz
		['02', '05', '0D', '11', '13'], // 50Hz
	),

	ENUM_VIDEO_FORMAT_HE130: formats(
		['01', '04', '07', '0A', '10', '12', '14', '16'], // 59.94Hz
		['02', '05', '08', '11', '13', '15'], // 50Hz
	),

	ENUM_VIDEO_FORMAT_HR140: formats(
		['01', '04', '07', '0A', '10', '14', '16'], // 59.94Hz
		['02', '05', '08', '11', '15'], // 50Hz
	),

	ENUM_VIDEO_FORMAT_UBX100: formats(
		['10', '14', '17', '19', '1B', '23'], // 59.94Hz — the 23.98p formats sit in this group here
		['11', '15', '18', '1A'], // 50Hz
	),

	ENUM_VIDEO_FORMAT_UB300: formats(
		['00', '01', '04', '07', '0A', '10', '16', '17', '19', '1B', '1C', '1E', '1F', '20', '44', '50'], // 59.94Hz
		['02', '05', '08', '11', '18', '1A', '1D', '45', '51'], // 50Hz
	),

	// AK-UB10 + AK-UB50, union. The UB10 has no interlace (04h/05h), no 119.88p/100p (26h/27h) and no
	// 48p/47.95p, but is the only one with the 3680x2760 sizes (A0h-A4h). Query-only on both.
	ENUM_VIDEO_FORMAT_UB50: formats(
		['04', '10', '14', '17', '19', '26', '90', '94', '98', '9C', 'A0', 'A2', 'A5', 'A7', 'AB', 'AE', 'B2'], // 59.94Hz
		['05', '11', '15', '18', '1A', '27', '91', '95', '99', '9D', 'A1', 'A3', 'A6', 'A8', 'AA', 'AC', 'AF', 'B3'], // 50Hz
		// prettier-ignore
		['1B', '21', '22', '23', '92', '93', '96', '97', '9A', '9B', '9E', '9F', 'A4', 'A9', 'AD', 'B0', 'B1', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9'], // 24Hz
	),

	ENUM_VIDEO_FORMAT_UE4: formats(
		['01', '10', '14', '17'], // 59.94Hz
		['02', '11', '15', '18'], // 50Hz
		['00', '20', '24', '25'], // 60Hz
	),

	ENUM_VIDEO_FORMAT_UE5: formats(
		['01', '10', '14', '17', '19'], // 59.94Hz
		['02', '11', '15', '18', '1A'], // 50Hz
		['00', '1F', '20', '24', '25'], // 60Hz
	),

	// AW-UE20 + AW-HE20. The HE20 has no 4K, i.e. no 17h, 18h and 24h.
	ENUM_VIDEO_FORMAT_UE20: formats(
		['01', '04', '10', '14', '17'], // 59.94Hz
		['02', '05', '11', '15', '18'], // 50Hz
		['00', '03', '20', '24', '25'], // 60Hz
	),

	// AW-UE30/UE40/UE50. The UE30 and UE40 have neither the PsF formats (07h, 08h, 0Ah) nor 16h.
	ENUM_VIDEO_FORMAT_UE50: formats(
		['01', '04', '07', '10', '14', '16', '17'], // 59.94Hz
		['02', '05', '08', '11', '15', '18'], // 50Hz
		['21', '22'], // 24Hz
		['0A', '1B', '23'], // 23.98Hz
	),

	// UE70series + HE42series. The HE42 models have neither 17h nor 18h.
	ENUM_VIDEO_FORMAT_UE70: formats(
		['01', '04', '07', '10', '14', '17'], // 59.94Hz
		['02', '05', '08', '11', '15', '18'], // 50Hz
		['80'], // Auto — listed under both frequencies, so it belongs to neither group
	),

	// AW-UE80, AW-UR100, AW-UE100 and the UE150 series share one list. The AW-HE145 in that series is
	// HD-only, i.e. it has none of 17h, 18h, 19h, 1Ah, 1Bh and 21h.
	ENUM_VIDEO_FORMAT_UE150: formats(
		['01', '04', '07', '10', '14', '16', '17', '19'], // 59.94Hz
		['02', '05', '08', '11', '15', '18', '1A'], // 50Hz
		['21', '22'], // 24Hz
		['0A', '1B', '23'], // 23.98Hz
	),

	ENUM_VIDEO_FORMAT_UE150A: formats(
		['01', '04', '10', '14', '17', '19'], // 59.94Hz
		['02', '05', '11', '15', '18', '1A'], // 50Hz
		['21', '22'], // 24Hz
		['1B', '23'], // 23.98Hz
	),

	ENUM_VIDEO_FORMAT_UE160: formats(
		['01', '10', '14', '17', '19', '26'], // 59.94Hz
		['02', '11', '15', '18', '1A', '27'], // 50Hz
		['21', '22'], // 24Hz
		['1B', '23'], // 23.98Hz
		['1F', '20'], // 60.00Hz
	),

	ENUM_VIDEO_FORMAT_POVCAM: formats(
		['01', '04', '12'], // 59.94Hz
		['02', '05', '13'], // 50Hz
	),

	// ###################################
	// #### System Frequency Look Ups ####
	// ###################################
	ENUM_FREQUENCY: FREQUENCY,
	ENUM_FREQUENCY_2: frequencies('0', '1'),
	ENUM_FREQUENCY_24: frequencies('0', '1', '2', '3'),
	ENUM_FREQUENCY_60: frequencies('0', '1', '4'),

	// ################################
	// #### White Balance Look Ups ####
	// ################################
	ENUM_WHITEBALANCE: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
		{ id: '9', label: 'VAR' },
	],
	ENUM_WHITEBALANCE_CX350: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '3', label: 'VAR' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
	],
	ENUM_WHITEBALANCE_POVCAM: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
		{ id: '9', label: 'VAR' },
		{ id: 'E', label: 'ATW Lock' },
	],
	ENUM_WHITEBALANCE_HE2: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
		{ id: '6', label: 'Preset 4500K' },
		{ id: '7', label: 'Preset 6000K' },
		{ id: '8', label: 'Preset 2800K' },
	],
	ENUM_WHITEBALANCE_UB50: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
		{ id: '9', label: 'VAR' },
		{ id: 'F', label: 'Other' },
	],
	// #########################
	// #### Preset Look Ups ####
	// #########################
	ENUM_PRESET: range(0, 99).map((i) => ({ id: String(i).padStart(2, '0'), label: `Preset ${i + 1}` })),

	ENUM_PRESET_SCOPE: [
		{ id: '0', label: 'Mode A - Pan, Tilt, Zoom, Focus, Iris, Gain, White Balance' },
		{ id: '1', label: 'Mode B - Pan, Tilt, Zoom, Focus, Iris' },
		{ id: '2', label: 'Mode C - Pan, Tilt, Zoom, Focus' },
	],

	ENUM_INSTALL_POSITION: [
		{ id: '0', label: 'Desktop' },
		{ id: '1', label: 'Hanging' },
	],

	ENUM_AUTOTRACKING_ANGLE: [
		{ id: '0', label: 'Off' },
		{ id: '1', label: 'Full Body' },
		{ id: '2', label: 'Upper Body' },
	],

	ENUM_AUTOTRACKING_STATUS: [
		{ id: '0', label: 'Not Tracking' },
		{ id: '1', label: 'Tracking' },
		{ id: '2', label: 'Lost' },
	],

	ENUM_SHOOTING_MODE: [
		{ id: '0', label: 'Normal' },
		{ id: '1', label: 'High Sens.' },
	],

	ENUM_ERROR: [
		{ id: '00', label: 'No Error' },
		{ id: '03', label: 'Motor Driver Error' },
		{ id: '04', label: 'Pan Sensor Error' },
		{ id: '05', label: 'Tilt Sensor Error' },
		{ id: '06', label: 'Controller RX Overrun Error' },
		{ id: '07', label: 'Controller RX Framing Error' },
		{ id: '08', label: 'Network RX Overrun Error' },
		{ id: '09', label: 'Network RX Framing Error' },
		{ id: '17', label: 'Controller RX Command Buffer Overflow' },
		{ id: '19', label: 'Network RX Command Buffer Overflow' },
		{ id: '21', label: 'System Error' },
		{ id: '22', label: 'Spec Limit Over' },
		{ id: '23', label: 'FPGA Config Error' },
		{ id: '24', label: 'Network Communication Error' },
		{ id: '25', label: 'CAMERA Communication Error' },
		{ id: '26', label: 'CAMERA RX Overrun Error' },
		{ id: '27', label: 'CAMERA RX Framing Error' },
		{ id: '28', label: 'CAMERA RX Command Buffer Overflow' },
		{ id: '29', label: 'CAM Life-monitoring Error' },
		{ id: '30', label: 'NET Life-monitoring Error' },
		{ id: '31', label: 'Fan1 Error' },
		{ id: '32', label: 'Fan2 Error' },
		{ id: '33', label: 'High Temp' },
		{ id: '36', label: 'Low Temp' },
		{ id: '39', label: 'Wiper Error' },
		{ id: '40', label: 'Temp Sensor Error' },
		{ id: '41', label: 'Lens Initialize Error' },
		{ id: '42', label: 'PT. Initialize Error' },
		{ id: '43', label: 'PoE++ Software auth. Timeout' },
		{ id: '45', label: 'PoE+ Software auth. Timeout' },
		{ id: '47', label: 'USB Streaming Error' },
		{ id: '50', label: 'MR Level Error' },
		{ id: '51', label: 'GYRO Initial Error' },
		{ id: '52', label: 'MR Offset Error' },
		{ id: '53', label: 'Origin Offset Error' },
		{ id: '54', label: 'Angle MR Sensor Error' },
		{ id: '55', label: 'PT. Gear Error' },
		{ id: '56', label: 'Motor Disconnect Error' },
		{ id: '57', label: 'Gyro Error' },
		{ id: '58', label: 'PT. Initialize Error' },
		{ id: '60', label: 'Update Firmware Error' },
		{ id: '61', label: 'Update Hardware Error' },
		{ id: '62', label: 'Update Error' },
		{ id: '63', label: 'Update Fan Error' },
	],
}
