// Several of these tables are pure arithmetic and used to be written out entry by entry. They are
// generated here instead, so the rule is stated once and cannot drift from the values it produces.
// src/__tests__/enum.test.js pins the generated output.

const hex = (n, width) => n.toString(16).toUpperCase().padStart(width, '0')

const range = (from, to, step = 1) => {
	const out = []
	for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i)
	return out
}

const signed = (n) => (n > 0 ? `+${n}` : `${n}`)

// Gain is sent as a hex step where 0 dB is 0x08, with 0x80/0x81 reserved for the auto/manual modes.
const gain = (lowDb, highDb, stepDb = 1, { auto = true, manual = false } = {}) => [
	...(auto ? [{ id: '80', label: 'Auto' }] : []),
	...range(lowDb, highDb, stepDb).map((db) => ({ id: hex(db + 8, 2), label: `${db} dB` })),
	...(manual ? [{ id: '81', label: 'Manual' }] : []),
]

// Chroma level as a percentage, centred on 0x80, with an explicit OFF entry.
const chromaPercent = (lowPct, highPct) => [
	{ id: '00', label: 'OFF' },
	...range(lowPct, highPct).map((pct) => ({ id: hex(pct + 0x80, 2), label: `${signed(pct)}%` })),
]

// Chroma level as discrete steps, centred on 0x03.
const chromaSteps = (low, high) => range(low, high).map((v) => ({ id: hex(v + 3, 2), label: signed(v) }))

// Preset recall speed: speed n maps to 250 + 25n, capped at the 999 the protocol allows.
const presetSpeeds = () => [
	{ id: '000', label: 'Speed Max' },
	...range(30, 1, -1).map((s) => ({
		id: String(Math.min(250 + 25 * s, 999)),
		label: `Speed ${String(s).padStart(2, ' ')}`,
	})),
]

// Preset recall time in whole seconds, sent as hex.
const presetTimes = () => range(99, 1, -1).map((t) => ({ id: hex(t, 3), label: `Time ${String(t).padStart(2, ' ')}s` }))

// The HE130 colour temperatures are not on a regular grid, so the values stay as data; only the
// sequential ids they are addressed by are generated.
// prettier-ignore
const COLOR_TEMPERATURE_HE130_KELVIN = [
	2000, 2010, 2020, 2040, 2050, 2070, 2080, 2090, 2110, 2120, 2140, 2150, 2170, 2180, 2200, 2210, 2230, 2240, 2260, 2280,
	2300, 2310, 2330, 2340, 2360, 2380, 2400, 2420, 2440, 2460, 2480, 2500, 2520, 2540, 2560, 2600, 2620, 2640, 2680, 2700,
	2720, 2740, 2780, 2800, 2820, 2850, 2870, 2920, 2950, 2970, 3000, 3020, 3070, 3100, 3120, 3150, 3200, 3250, 3270, 3330,
	3360, 3420, 3450, 3510, 3570, 3600, 3660, 3720, 3780, 3840, 3870, 3930, 3990, 4050, 4110, 4170, 4240, 4320, 4360, 4440,
	4520, 4600, 4680, 4760, 4840, 4920, 5000, 5100, 5200, 5300, 5400, 5500, 5600, 5750, 5850, 6000, 6150, 6300, 6450, 6650,
	6800, 7000, 7150, 7400, 7600, 7800, 8100, 8300, 8600, 8900, 9200, 9600, 10000, 10500, 11000, 11500, 12000, 12500, 13000,
	14000, 15000,
]

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
	ENUM_GAIN_UE160: gain(-4, 12),
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
	ENUM_COLOR_TEMPERATURE_HE40: range(0, 75).map((i) => ({ id: hex(i, 3), label: `${2400 + i * 100}K` })),
	ENUM_COLOR_TEMPERATURE_HE130: COLOR_TEMPERATURE_HE130_KELVIN.map((k, i) => ({ id: hex(i, 3), label: `${k}K` })),

	// ###############################
	// #### Chroma Level Look Ups ####
	// ###############################
	ENUM_CHROMA_LEVEL_3: chromaSteps(-3, 3),
	ENUM_CHROMA_LEVEL_10: chromaSteps(0, 10),
	ENUM_CHROMA_LEVEL_40: chromaPercent(-99, 40),
	ENUM_CHROMA_LEVEL_99: chromaPercent(-99, 99),

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

	// ##########################################
	// #### Digital Noise Reduction (DNR) #######
	// ##########################################
	ENUM_DNR: [
		{ id: '00', label: 'Off' },
		{ id: '01', label: 'Low' },
		{ id: '02', label: 'High' },
	],

	// #######################################
	// #### Video Format Look Ups (OSA:87) ###
	// #######################################
	ENUM_VIDEO_FORMAT: [
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
	],

	// ################################
	// #### White Balance Look Ups ####
	// ################################
	ENUM_WHITEBALANCE_SET: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
		{ id: '9', label: 'VAR' },
	],
	ENUM_WHITEBALANCE_SET_HE2: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
		{ id: '6', label: 'Preset 4500K' },
		{ id: '7', label: 'Preset 6000K' },
		{ id: '8', label: 'Preset 2800K' },
	],
	ENUM_WHITEBALANCE_SET_CX350: [
		{ id: '0', label: 'ATW' },
		{ id: '1', label: 'AWC A' },
		{ id: '2', label: 'AWC B' },
		{ id: '3', label: 'VAR' },
		{ id: '4', label: 'Preset 3200K' },
		{ id: '5', label: 'Preset 5600K' },
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
