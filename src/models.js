import { e } from './enum.js'

export const MODELS = [
	{ id: 'Auto', series: 'Auto', label: 'Auto Detect' },
	{ id: 'AW-HE2', series: 'HE2', label: 'AW-HE2' },
	{ id: 'AW-HE20', series: 'UE20', label: 'AW-HE20' },
	{ id: 'AW-HE35', series: 'HE40', label: 'AW-HE35' },
	{ id: 'AW-HE38', series: 'HE40', label: 'AW-HE38' },
	{ id: 'AW-HE40', series: 'HE40', label: 'AW-HE40' },
	{ id: 'AW-HE42', series: 'UE70', label: 'AW-HE42' },
	{ id: 'AW-HE48', series: 'HE40', label: 'AW-HE48' },
	{ id: 'AW-HE50', series: 'HE50', label: 'AW-HE50' },
	{ id: 'AW-HE58', series: 'HE40', label: 'AW-HE58' },
	{ id: 'AW-HE60', series: 'HE50', label: 'AW-HE60' },
	{ id: 'AW-HE65', series: 'HE40', label: 'AW-HE65' },
	{ id: 'AW-HE68', series: 'UE70', label: 'AW-HE68' },
	{ id: 'AW-HE70', series: 'HE40', label: 'AW-HE70' },
	{ id: 'AW-HE75', series: 'UE70', label: 'AW-HE75' },
	{ id: 'AW-HE120', series: 'HE120', label: 'AW-HE120' },
	{ id: 'AW-HE130', series: 'HE130', label: 'AW-HE130' },
	{ id: 'AW-HE145', series: 'UE150', label: 'AW-HE145' },
	{ id: 'AW-HN38', series: 'HE40', label: 'AW-HN38' },
	{ id: 'AW-HN40', series: 'HE40', label: 'AW-HN40' },
	{ id: 'AW-HN65', series: 'HE40', label: 'AW-HN65' },
	{ id: 'AW-HN130', series: 'HE130', label: 'AW-HN130' },
	{ id: 'AW-HR140', series: 'HR140', label: 'AW-HR140' },
	{ id: 'AW-UE4', series: 'UE4', label: 'AW-UE4' },
	{ id: 'AW-UE20', series: 'UE20', label: 'AW-UE20' },
	{ id: 'AW-UE40', series: 'UE50', label: 'AW-UE40' },
	{ id: 'AW-UE50', series: 'UE50', label: 'AW-UE50' },
	{ id: 'AW-UE63', series: 'UE70', label: 'AW-UE63' },
	{ id: 'AW-UE65', series: 'UE70', label: 'AW-UE65' },
	{ id: 'AW-UE70', series: 'UE70', label: 'AW-UE70' },
	{ id: 'AW-UE80', series: 'UE80', label: 'AW-UE80' },
	{ id: 'AW-UE100', series: 'UE100', label: 'AW-UE100' },
	{ id: 'AW-UR100', series: 'UE100', label: 'AW-UR100' },
	{ id: 'AW-UE150', series: 'UE150', label: 'AW-UE150' },
	{ id: 'AW-UE155', series: 'UE150', label: 'AW-UE155' },
	{ id: 'AW-UE160', series: 'UE160', label: 'AW-UE160' },
	{ id: 'AW-UN70', series: 'UE70', label: 'AW-UN70' },
	{ id: 'AW-UN145', series: 'UE150', label: 'AW-UN145' },
	{ id: 'AK-UB300', series: 'UB300', label: 'AK-UB300' },
	{ id: 'AG-CX350', series: 'CX350', label: 'AG-CX350' },
	{ id: 'AG-CX200', series: 'CX350', label: 'AG-CX200' },
	{ id: 'AJ-UPX360', series: 'CX350', label: 'AJ-UPX360' },
	{ id: 'AJ-CX4000', series: 'CX350', label: 'AJ-CX4000' },
	{ id: 'AJ-UPX900', series: 'CX350', label: 'AJ-UPX900' },
	{ id: 'Other', series: 'Other', label: 'Other Cameras' },
]

// list of all Series:
// Other
// CX350
// HE2
// HE40
// HE50
// HE60
// HE120
// HE130
// HR140
// UB300
// UE4
// UE20
// UE70
// UE50
// UE80
// UE100
// UE150
// UE160

// The feature set shared by every model. Each series below spreads this and states only what it
// changes, so a series body is exactly the list of ways that model deviates from the norm.
// When integrating a new camera model, start here and override only what differs.
const BASE_CAPABILITIES = {
	audioVolumeLevel: { maxch: 2, min: -40, max: 20, step: 1 }, // Has Audio Volume Level control (OSA:D5)
	chromaLevel: { cmd: 'OCG', dropdown: e.ENUM_CHROMA_LEVEL_3 }, // Has Chroma Level control (OCG)
	chromaPhase: { offset: 0x80, limit: 31, step: 1, hexlen: 2 }, // Has Chroma Phase (OSJ:0B)
	colorGain: { cmd: { red: 'ORI', blue: 'OBI' }, offset: 0x96, limit: 150, step: 1, hexlen: 3 }, // Has numbered red/blue Gain (ORG and OBG)
	colorPedestal: { cmd: { red: 'ORP', blue: 'OBP' }, offset: 0x96, limit: 150, step: 1, hexlen: 3 }, // Has numbered red/blue Pedestal (ORP or OBP)
	colorTemperature: { advanced: { inc: 'OSI:1E', dec: 'OSI:1F', set: 'OSI:20', min: 2000, max: 15000 } }, // Has Color Temperature (OSD:B1 or OSI:20)
	colorbar: true, // Has Color Bar Generator (DCB)
	dnr: { dropdown: e.ENUM_DNR }, // Has Digital Noise Reduction (OSD:3A)
	drs: { dropdown: e.ENUM_DRS }, // Has Dynamic Range Stretch (OSE:33)
	error: true, // Camera can return enumerated error messages (rER)
	filter: { dropdown: e.ENUM_FILTER_OTHER }, // Has ND Filter Support (OFT)
	focus: true, // Has Focus control and position (Fxx and AXFxxx)
	focusAuto: true, // Has (switchable) Auto Focus (OAF)
	focusPushAuto: true, // Has Push Auto Focus feature (OSE:69:1)
	gain: { cmd: 'OGS', dropdown: e.ENUM_GAIN_CX350 }, // Has Gain (OGS/OGU)
	install: true, // Has support for Desktop or Hanging Install Position (iNSx)
	iris: true, // Has Iris control and position (AXIxxx)
	irisAuto: true, // Has (switchable) Auto Iris (ORS)
	irisF: false, // Has Iris F No. decoding (OIF)
	night: true, // Has Day/Night Mode (d6x)
	ois: { dropdown: e.ENUM_OIS_OTHER }, // Has Optical Image Stabilisation control (OIS)
	panTilt: true, // Has Pan/Tilt Head control and position support (PTSxxxx and aPCxxxxxx)
	pedestal: { cmd: 'OSJ:0F', offset: 0x800, limit: 200, step: 1, hexlen: 3 }, // Has Master Pedestal (OTD, OSJ:0F or OSG:4A)
	poll: false, // Definiton of states that needs to be polled continously from camera (never updated by subscription etc.)
	power: true, // Has Power control and status (px and Ox)
	preset: 100, // Has Preset operations (Mxx, Rxx and Cxx) and states (sXX and qXX)
	presetSpeed: { dropdown: e.ENUM_PRESET_SPEED_TABLE_2 }, // Has Preset Recall Speed control (UPVSxx)
	presetThumbnails: false, // Has support for autogenerated Preset Thumbnails
	presetTime: true, // Has additional Preset Recall Time control (UPVSxx and OSJ:29:1)
	pull: false, // Additional definition of states that needs to be pulled from camera if no event subscription is available
	recordSD: true, // Has SD Card Recording control (sdctrl?save=start or sdctrl?save=end)
	restart: true, // Has Restart command (initial?cmd=reset)
	shootingMode: false, // Has Shooting Mode control (OSJ:0C)
	shutter: { cmd: 'OSJ:03', inc: 'OSJ:04', dec: 'OSJ:05', dropdown: e.ENUM_SHUTTER_ADV }, // Has Shutter Support (OSH, OSJ:03 - OSJ:06, ...)
	streamRTMP: true, // Has RTMP Push Streaming control (rtmp_ctrl?cmd=start or rtmp_ctrl?cmd=stop)
	streamSRT: true, // Has SRT Caller Streaming control (srt_ctrl?cmd=start or srt_ctrl?cmd=stop)
	streamTS: true, // Has MPEG-TS Output Streaming control (ts_ctrl?cmd=start or ts_ctrl?cmd=stop)
	subscription: true, // Camera supports subscription to TCP-based status update notifications and bulk retreival of initial state (camdata.html)
	tally: true, // Has Red Tally (TLR or DAx)
	tally2: true, // Has Green Tally (TLG)
	tally3: true, // Has Yellow Tally (TLY)
	trackingAuto: true, // Has internal Autotracking features (OSL:B6 - OSL:C2)
	version: true, // Camera provides software version (from initial getinfo or QSV, OSV)
	videoFormat: true, // Camera reports current video format (OSA:87)
	whiteBalance: { dropdown: e.ENUM_WHITEBALANCE }, // Has White Balance Modes (OAW)
	zoom: true, // Has Zoom control and position (Zxx and AXZxxx)
}

export const SERIES_SPECS = [
	{
		// Basic set of common features. Use this as base when integrating new camera models.
		id: 'Other',
		capabilities: BASE_CAPABILITIES,
	},
	{
		// Specific for the AG-CX350/4000 Series
		id: 'CX350',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_99 },
			chromaPhase: false,
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 200, step: 1, hexlen: 3 },
			colorPedestal: {
				cmd: { red: 'ORP', blue: 'OBP', green: 'OSJ:10' },
				offset: 0x96,
				limit: 100,
				step: 1,
				hexlen: 3,
			},
			dnr: false,
			drs: false,
			error: false,
			filter: { dropdown: e.ENUM_FILTER_3 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_CX350 },
			install: false,
			night: false,
			panTilt: false,
			poll: {
				ptz: ['GF', 'GI', 'GZ'],
				cam: [
					'QAF',
					'QAW',
					'QBR',
					'QBP',
					'QFT',
					'QGU',
					'QIS',
					'QLR',
					'QLG',
					'QRP',
					'QSD:4F',
					'QSD:B0',
					'QSG:39',
					'QSG:3A',
					'QSI:20',
					'QSJ:0F',
					'QSJ:10',
				],
				web: ['get_state'],
			},
			power: false,
			preset: false,
			presetSpeed: false,
			presetTime: false,
			restart: false,
			shutter: false,
			streamTS: false,
			subscription: false,
			tally3: false,
			trackingAuto: false,
			videoFormat: false,
			whiteBalance: { dropdown: e.ENUM_WHITEBALANCE_CX350 },
		},
	},
	{
		// Specific for the AW-HE2 Camera
		id: 'HE2',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaLevel: false,
			chromaPhase: false,
			colorGain: false,
			colorPedestal: false,
			colorTemperature: false,
			dnr: false,
			drs: false,
			filter: false,
			focus: false,
			focusAuto: false,
			focusPushAuto: false,
			gain: false,
			install: false,
			iris: false,
			night: false,
			ois: false,
			pedestal: false,
			preset: 9,
			presetSpeed: false,
			presetTime: false,
			recordSD: false,
			restart: false,
			shutter: false,
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
			whiteBalance: { dropdown: e.ENUM_WHITEBALANCE_HE2 },
			zoom: false,
		},
	},
	{
		// Specific for the HE40 Series
		id: 'HE40',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaPhase: false,
			colorGain: { cmd: { red: 'ORG', blue: 'OBG' }, offset: 0x1e, limit: 30, step: 1, hexlen: 2 },
			colorPedestal: false,
			colorTemperature: { index: { cmd: 'OSD:B1', dropdown: e.ENUM_COLOR_TEMPERATURE_LINEAR } },
			drs: { dropdown: e.ENUM_DRS_OFF_LOW_HIGH },
			filter: false,
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_HE40 },
			pedestal: { cmd: 'OTD', offset: 0x1e, limit: 30, step: 3, hexlen: 2 },
			poll: { ptz: false, cam: false, web: ['get_state'] },
			presetTime: false,
			pull: {
				ptz: ['O', 'PE00', 'PE01', 'PE02', 'D6', 'DA', 'INS', 'LPI', 'PST', 'RER', 'S', 'UPVS'],
				cam: [
					'QAF',
					'QAW',
					'QBR',
					'QCG',
					'QGB',
					'QGU',
					'QIS',
					'QGR',
					'QRS',
					'QSH',
					'QTD',
					'QSA:87',
					'QSD:3A',
					'QSD:4F',
					'QSD:B1',
					'QSE:33',
					'QSE:71',
				],
				web: false,
			},
			shutter: { cmd: 'OSH', dropdown: e.ENUM_SHUTTER_HE40 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the AW-HE50 Camera
		id: 'HE50',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaPhase: false,
			colorGain: { cmd: { red: 'ORG', blue: 'OBG' }, offset: 0x1e, limit: 30, step: 1, hexlen: 2 },
			colorPedestal: false,
			colorTemperature: { index: { cmd: 'OSD:B1', dropdown: e.ENUM_COLOR_TEMPERATURE_LINEAR } },
			drs: { dropdown: e.ENUM_DRS_OFF_LOW_HIGH },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_HE50 },
			ois: false,
			pedestal: { cmd: 'OTD', offset: 0x1e, limit: 30, step: 3, hexlen: 2 },
			presetTime: false,
			recordSD: false,
			restart: false,
			shutter: { cmd: 'OSH', dropdown: e.ENUM_SHUTTER_HE40 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the AW-HE120 Camera
		id: 'HE120',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaPhase: false,
			colorTemperature: { index: { cmd: 'OSD:B1', dropdown: e.ENUM_COLOR_TEMPERATURE_LINEAR } },
			filter: { dropdown: e.ENUM_FILTER_3 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_HE120 },
			night: false,
			ois: false,
			pedestal: { cmd: 'OTP', offset: 0x96, limit: 150, step: 1, hexlen: 3 },
			presetTime: false,
			recordSD: false,
			restart: false,
			shutter: { cmd: 'OSH', dropdown: e.ENUM_SHUTTER_HE120 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the AW-HE130 Camera
		id: 'HE130',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_40 },
			chromaPhase: false,
			colorPedestal: { cmd: { red: 'ORP', blue: 'OBP' }, offset: 0x96, limit: 100, step: 1, hexlen: 3 },
			colorTemperature: { index: { cmd: 'OSD:B1', dropdown: e.ENUM_COLOR_TEMPERATURE_NONLINEAR } },
			filter: { dropdown: e.ENUM_FILTER_2 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_HE130 },
			pedestal: { cmd: 'OTP', offset: 0x96, limit: 150, step: 1, hexlen: 3 },
			presetTime: false,
			recordSD: false,
			shutter: { cmd: 'OSH', dropdown: e.ENUM_SHUTTER_HE130 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the AW-HR140 Camera
		id: 'HR140',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: { maxch: 4, min: -40, max: 12, step: 1 },
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_40 },
			chromaPhase: false,
			colorPedestal: { cmd: { red: 'ORP', blue: 'OBP' }, offset: 0x96, limit: 100, step: 1, hexlen: 3 },
			colorTemperature: { index: { cmd: 'OSD:B1', dropdown: e.ENUM_COLOR_TEMPERATURE_NONLINEAR } },
			filter: { dropdown: e.ENUM_FILTER_2 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_HR140 },
			ois: { dropdown: e.ENUM_OIS_HR140 },
			pedestal: { cmd: 'OTP', offset: 0x96, limit: 150, step: 1, hexlen: 3 },
			presetTime: false,
			pull: {
				ptz: ['O', 'PE00', 'PE01', 'PE02', 'DA', 'INS', 'LPI', 'PST', 'RER', 'S', 'UPVS'],
				cam: [
					'QAF',
					'QAW',
					'QBR',
					'QBI',
					'QBP',
					'QFT',
					'QGU',
					'QIS',
					'QRI',
					'QRP',
					'QSV',
					'QTP',
					'QSA:87',
					'QSD:3A',
					'QSD:4F',
					'QSD:B1',
					'QSE:33',
					'QSE:71',
					'QSA:D5:0',
					'QSA:D5:1',
					'QSA:D5:2',
					'QSA:D5:3',
				],
				web: false,
			},
			recordSD: false,
			shutter: { cmd: 'OSH', dropdown: e.ENUM_SHUTTER_HE130 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the AK-UB300 Camera
		id: 'UB300',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_40 },
			chromaPhase: false,
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 1000, step: 1, hexlen: 3 },
			colorPedestal: { cmd: { red: 'OSG:4C', blue: 'OSG:4E' }, offset: 0x800, limit: 800, step: 1, hexlen: 3 },
			colorTemperature: { advanced: { inc: 'OSI:1E', dec: 'OSI:1F' } },
			dnr: { dropdown: e.ENUM_OFF_ON },
			drs: false,
			filter: { dropdown: e.ENUM_FILTER_3 },
			focus: false,
			focusAuto: false,
			focusPushAuto: false,
			gain: { cmd: 'OGS', dropdown: e.ENUM_GAIN_UB300 },
			install: false,
			irisF: true,
			night: false,
			ois: false,
			panTilt: false,
			pedestal: { cmd: 'OSG:4A', offset: 0x80, limit: 99 },
			preset: false,
			presetSpeed: false,
			presetTime: false,
			recordSD: false,
			restart: false,
			shutter: false, // special implementation req. 'OSG:5D', e.ENUM_SHUTTER_UB300
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally3: false,
			trackingAuto: false,
			version: false,
			whiteBalance: true, // no white balance mode
			zoom: false, // special implementation req. 'HZT', 'HZW', 'HZS', 'LZS:xx'
		},
	},
	{
		// Specific for the AW-UE4 Camera
		id: 'UE4',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaLevel: { cmd: 'OCG', dropdown: e.ENUM_CHROMA_LEVEL_10 },
			chromaPhase: false,
			colorGain: false,
			colorPedestal: false,
			colorTemperature: false,
			drs: { dropdown: e.ENUM_OFF_ON },
			filter: false,
			focus: false,
			focusAuto: false,
			focusPushAuto: false,
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE4 },
			iris: false,
			irisAuto: false, // supports only 1 (Auto)
			night: false,
			ois: false,
			pedestal: false,
			presetSpeed: false,
			presetTime: false,
			recordSD: false,
			shutter: { cmd: 'OSJ:03', inc: 'OSJ:04', dec: 'OSJ:05', dropdown: e.ENUM_SHUTTER_ADV_UE4 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the UE20/HE20
		id: 'UE20',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: { maxch: 1, min: -36, max: 12, step: 3 },
			chromaLevel: { cmd: 'OCG', dropdown: e.ENUM_CHROMA_LEVEL_10 },
			chromaPhase: false,
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 30, step: 1, hexlen: 3 },
			colorPedestal: false,
			colorTemperature: false,
			drs: { dropdown: e.ENUM_OFF_ON },
			filter: false,
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE100 },
			irisF: true,
			night: false,
			ois: false,
			pedestal: { cmd: 'OSJ:0F', offset: 0x800, limit: 10, step: 1, hexlen: 3 },
			poll: { ptz: false, cam: false, web: ['get_rtmp_status'] },
			presetThumbnails: true,
			presetTime: false,
			pull: { ptz: false, cam: ['QSA:D5:0'], web: false },
			recordSD: false,
			shutter: { cmd: 'OSJ:03', inc: 'OSJ:04', dec: 'OSJ:05', dropdown: e.ENUM_SHUTTER_ADV_UE20 },
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the UE50/40
		id: 'UE50',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: { maxch: 2, min: -36, max: 12, step: 3 },
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 200, step: 1, hexlen: 3 },
			colorPedestal: false,
			filter: false,
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE100 },
			irisF: true,
			night: false,
			poll: { ptz: false, cam: false, web: ['get_rtmp_status', 'get_srt_status', 'get_ts_status'] },
			presetThumbnails: true,
			pull: {
				ptz: false,
				cam: ['QSA:87', 'QSD:3A', 'QSE:33', 'QSJ:0B', 'QSL:B6', 'QSL:B7', 'QSL:BB', 'QSA:D5:0', 'QSA:D5:1'],
				web: false,
			}, // ToDo
			recordSD: false,
			tally3: false,
		},
	},
	{
		// Specific for the UE70 Series
		id: 'UE70',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: false,
			chromaPhase: false,
			colorGain: { cmd: { red: 'ORG', blue: 'OBG' }, offset: 0x1e, limit: 30, step: 1, hexlen: 2 },
			colorPedestal: false,
			colorTemperature: { index: { cmd: 'OSD:B1', dropdown: e.ENUM_COLOR_TEMPERATURE_LINEAR } },
			drs: { dropdown: e.ENUM_DRS_OFF_LOW_HIGH },
			filter: { dropdown: e.ENUM_FILTER_3A },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_HE40 },
			pedestal: { cmd: 'OTD', offset: 0x1e, limit: 30, step: 3, hexlen: 2 },
			poll: { ptz: false, cam: false, web: ['get_state'] },
			presetTime: false,
			shutter: { cmd: 'OSH', dropdown: e.ENUM_SHUTTER_HE40 },
			streamRTMP: false,
			streamSRT: false,
			streamTS: false,
			tally2: false,
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the UE80
		id: 'UE80',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: { maxch: 2, min: -36, max: 12, step: 3 },
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_99 },
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 200, step: 1, hexlen: 3 },
			colorPedestal: false,
			filter: { dropdown: e.ENUM_FILTER_3A },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE100 },
			irisF: true,
			ois: { dropdown: e.ENUM_OIS_UE80 },
			poll: { ptz: false, cam: false, web: ['get_rtmp_status', 'get_srt_status', 'get_ts_status'] },
			presetThumbnails: true,
			pull: {
				ptz: false,
				cam: ['QSA:87', 'QSD:3A', 'QSE:33', 'QSJ:0B', 'QSL:B6', 'QSL:B7', 'QSL:BB', 'QSA:D5:0', 'QSA:D5:1'],
				web: false,
			}, // ToDo
			recordSD: false,
			tally3: false,
		},
	},
	{
		// Specific for the UE100 Series
		id: 'UE100',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: { maxch: 1, min: -36, max: 12, step: 3 },
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_99 },
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 200, step: 1, hexlen: 3 },
			colorPedestal: {
				cmd: { red: 'ORP', blue: 'OBP', green: 'OSJ:10' },
				offset: 0x96,
				limit: 100,
				step: 1,
				hexlen: 3,
			},
			filter: { dropdown: e.ENUM_FILTER_3 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE100 },
			irisF: true,
			ois: { dropdown: e.ENUM_OIS_UE100 },
			poll: {
				ptz: false,
				cam: ['QIF', 'QSD:B0', 'QSJ:10'],
				web: ['get_rtmp_status', 'get_srt_status', 'get_ts_status'],
			},
			presetThumbnails: true,
			pull: {
				ptz: ['O', 'PE00', 'PE01', 'PE02', 'D6', 'INS', 'PST', 'PTD', 'PTG', 'PTV', 'RER', 'S', 'TAA', 'UPVS'],
				cam: [
					'QAF',
					'QAW',
					'QBR',
					'QBP',
					'QIS',
					'QRP',
					'QRS',
					'QSA:87',
					'QSD:3A',
					'QSE:33',
					'QSE:71',
					'QSG:39',
					'QSG:3A',
					'QSJ:0B',
					'QSJ:0F',
					'QSJ:10',
					'QSJ:29',
					'QSA:D5:0',
				],
				web: false,
			},
			recordSD: false,
			shootingMode: { cmd: 'OSJ:0C', dropdown: e.ENUM_SHOOTING_MODE },
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the UE150 Series
		id: 'UE150',
		capabilities: {
			...BASE_CAPABILITIES,
			audioVolumeLevel: { maxch: 1, min: -36, max: 12, step: 3 },
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_99 },
			colorGain: { cmd: { red: 'OSG:39', blue: 'OSG:3A' }, offset: 0x800, limit: 200, step: 1, hexlen: 3 },
			colorPedestal: {
				cmd: { red: 'ORP', blue: 'OBP', green: 'OSJ:10' },
				offset: 0x96,
				limit: 100,
				step: 1,
				hexlen: 3,
			},
			filter: { dropdown: e.ENUM_FILTER_3 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE150 },
			irisF: true,
			poll: {
				ptz: false,
				cam: ['QIF', 'QSD:B0', 'QSJ:10'],
				web: ['get_rtmp_status', 'get_srt_status', 'get_ts_status'],
			},
			presetThumbnails: true,
			recordSD: false,
			shootingMode: { cmd: 'OSJ:0C', dropdown: e.ENUM_SHOOTING_MODE },
			tally3: false,
			trackingAuto: false,
		},
	},
	{
		// Specific for the AW-UE160 Camera
		id: 'UE160',
		capabilities: {
			...BASE_CAPABILITIES,
			chromaLevel: { cmd: 'OSD:B0', dropdown: e.ENUM_CHROMA_PCT_40 },
			chromaPhase: false,
			colorGain: {
				cmd: { red: 'OSL:36', blue: 'OSL:38', green: 'OSL:37' },
				offset: 0x800,
				limit: 1000,
				step: 1,
				hexlen: 3,
			},
			colorPedestal: {
				cmd: { red: 'OSG:4C', blue: 'OSG:4E', green: 'OSG:4D' },
				offset: 0x800,
				limit: 800,
				step: 1,
				hexlen: 3,
			},
			dnr: { dropdown: e.ENUM_OFF_ON },
			drs: false,
			filter: { dropdown: e.ENUM_FILTER_3 },
			gain: { cmd: 'OGU', dropdown: e.ENUM_GAIN_UE160 },
			irisF: true,
			ois: { dropdown: e.ENUM_OIS_UE160 },
			poll: { ptz: false, cam: false, web: ['get_rtmp_status', 'get_srt_status', 'get_ts_status'] },
			presetThumbnails: true,
			recordSD: false,
			shootingMode: { cmd: 'OSJ:0C', dropdown: e.ENUM_SHOOTING_MODE },
			trackingAuto: false,
		},
	},
]
