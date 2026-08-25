import { createModuleLogger } from '@companion-module/base'

import { requestPresetCounters } from './polling.js'

const logger = createModuleLogger('parser')

const REFUSAL = /^[eE]R([123]):(.*)$/

// pE bank -> [state key, first preset index, number of presets reported].
const PRESET_BANKS = {
	'00': ['presetEntries0', 0, 40],
	'01': ['presetEntries1', 40, 40],
	'02': ['presetEntries2', 80, 20],
}

// Preset number as the OSJ preset commands carry it: two decimal digits, 00 being preset 1.
function presetIndex(value) {
	const idx = parseInt(value, 10)
	return idx >= 0 && idx < 100 ? idx : null
}

function clearPresetCache(self, idx) {
	self.data.presetThumbnails[idx] = undefined
	self.data.presetNames[idx] = undefined
	self.data.presetCounters[idx] = undefined
}

// OSJ:3C:[bank]:[9 hex digits] — one 4-bit counter per preset, bumped by the camera whenever that
// preset's name or thumbnail changed. Read at connect, and as the catch-all for a preset stored over
// an occupied slot: #M carries no notification of its own and leaves the pE entry bitmap unchanged,
// so the counter is what says the thumbnail behind it is a different one now.
function applyPresetCounters(self, bank, digits) {
	const caps = self.SERIES?.capabilities
	if (!caps || typeof digits !== 'string') return

	digits = digits.replace('0x', '')

	// Banks 00h-0Ah carry nine presets each; bank 0Bh carries preset 100 alone.
	for (let i = 0; i < 9; i++) {
		const idx = bank * 9 + i
		if (idx >= 100 || i >= digits.length) break

		if (self.data.presetCounters[idx] === digits[i]) continue
		self.data.presetCounters[idx] = digits[i]

		// An empty slot has no name and no thumbnail to read; pE has already dropped its cache.
		if (self.data.presetEntries[idx] !== '1') continue

		// Fire and forget, as the thumbnail fetch has always been: each answer parses on its own.
		if (caps.presetThumbnails) self.getThumbnail(idx)
		if (caps.presetNames) self.getCam('QSJ:35:' + idx.toString(10).padStart(2, '0'))
	}
}

// Reads a camera reply as a refusal, or returns null if it is an ordinary answer.
export function parseRefusal(str) {
	const match = REFUSAL.exec(str)

	return match ? { code: Number(match[1]), command: match[2] } : null
}

export function parseUpdate(self, str, { echo = false, pushed = false } = {}) {
	if (str[0].substring(0, 3) === 'rER') {
		self.data.error = str[0].substring(3)
	}

	if (str[0].substring(0, 1) === 'g') {
		switch (str[0].substring(1, 2)) {
			// ToDo: handle "---" on power off
			case 'z':
				self.data.zoomPosition = parseInt(str[0].substring(2, 5), 16) - 0x555
				break
			case 'f':
				self.data.focusPosition = parseInt(str[0].substring(2, 5), 16) - 0x555
				break
			case 'i':
				self.data.irisPosition = parseInt(str[0].substring(2, 5), 16) - 0x555
				self.data.irisMode = str[0].substring(5, 6)
				break
		}
	}
	if (str[0].substring(0, 3) === 'aPC') {
		self.data.panPosition = parseInt(str[0].substring(3, 7), 16) - 0x8000
		self.data.tiltPosition = parseInt(str[0].substring(7, 11), 16) - 0x8000
	}

	if (str[0].substring(0, 2) === 'ax') {
		switch (str[0].substring(2, 3)) {
			case 'z':
				self.data.zoomPosition = parseInt(str[0].substring(3), 16) - 0x555
				break
			case 'f':
				self.data.focusPosition = parseInt(str[0].substring(3), 16) - 0x555
				break
			case 'i':
				self.data.irisPosition = parseInt(str[0].substring(3), 16) - 0x555
				break
		}
	}

	if (str[0].substring(0, 2) === 'lC') {
		const direction = parseInt(str[0].substring(2, 3), 10)
		if (direction >= 1 && direction <= 4) self.data.panTiltLimits[direction - 1] = str[0].substring(3, 4)
	}

	if (str[0].substring(0, 3) === 'lPI') {
		self.data.zoomPosition = parseInt(str[0].substring(3, 6), 16) - 0x555
		self.data.focusPosition = parseInt(str[0].substring(6, 9), 16) - 0x555
		self.data.irisPosition = parseInt(str[0].substring(9, 12), 16) - 0x555
	}

	if (str[0].substring(0, 1) === 'q') {
		const q = str[0].match(/q(\d\d)/)
		if (q) {
			const i = parseInt(q[1])
			self.data.presetCompletedIdx = self.data.presetEntries[i] === '1' ? i : null
		}
	}

	if (str[0].substring(0, 1) === 's') {
		const s = str[0].match(/s(\d\d)/)
		if (s) {
			const i = parseInt(s[1])
			self.data.presetSelectedIdx = self.data.presetEntries[i] === '1' ? i : null
		}
	}

	if (str[0].substring(0, 3) === 'tAA') {
		self.data.tally = parseInt(str[0].substring(3, 6), 2) > 0 ? '1' : '0'
		self.data.tally2 = parseInt(str[0].substring(6, 9), 2) > 0 ? '1' : '0'
		self.data.tally3 = parseInt(str[0].substring(9, 13), 2) > 0 ? '1' : '0'
	}

	if (str[0].substring(0, 2) === 'pE') {
		let readCounters = false
		const bank = PRESET_BANKS[str[0].substring(2, 4)]
		if (bank) {
			const [key, base, width] = bank
			const previous = self.data[key]
			const entries = parseInt(str[0].substring(4), 16).toString(2).padStart(width, 0).split('').reverse()
			self.data[key] = entries

			let changed = false
			entries.forEach((p, i) => {
				if (p === previous[i]) return
				changed = true
				if (p !== '1') clearPresetCache(self, base + i)
			})

			readCounters = changed || pushed
		}

		self.data.presetEntries = self.data.presetEntries0.concat(self.data.presetEntries1.concat(self.data.presetEntries2))

		if (readCounters) requestPresetCounters(self)

		if (self.data.presetSelectedIdx !== null) {
			if (self.data.presetEntries[self.data.presetSelectedIdx] === '0') {
				self.data.presetSelectedIdx = null
			}
		}
		if (self.data.presetCompletedIdx !== null) {
			if (self.data.presetEntries[self.data.presetCompletedIdx] === '0') {
				self.data.presetCompletedIdx = null
			}
		}
	}

	if (str[0].substring(0, 3) === 'pST') {
		self.data.presetSpeedTable = str[0].substring(3)
	}

	if (str[0].substring(0, 3) === 'pTD') {
		//self.data.panPosition = parseInt(str[0].substring(3, 7), 16)
		//self.data.tiltPosition = parseInt(str[0].substring(7, 11), 16)
		//self.data.zoom999Position = parseInt(str[0].substring(11, 14), 16)
		//self.data.focus99Position = parseInt(str[0].substring(14, 16), 16)
		self.data.irisLabel =
			str[0].substring(16, 18) === 'FF' ? 'CLOSE' : 'f/' + (parseInt(str[0].substring(16, 18), 16) / 10).toFixed(1)
	}

	if (str[0].substring(0, 3) === 'pTG') {
		self.data.gain = str[0].substring(3, 5)
		self.data.colorTempLabel = parseInt(str[0].substring(5, 10), 16).toString() + 'K'
		self.data.shutter = str[0].substring(10, 11)
		self.data.shutterStepLabel = '1/' + parseInt(str[0].substring(11, 15), 16).toString()
		//self.data.shutterSynchroLabel = (parseInt(str[0].substring(15, 20), 16) / 10).toFixed(1) + 'Hz'
		self.data.filter = str[0].substring(20, 21)
	}

	if (str[0].substring(0, 3) === 'pTV') {
		self.data.panPosition = parseInt(str[0].substring(3, 7), 16) - 0x8000
		self.data.tiltPosition = parseInt(str[0].substring(7, 11), 16) - 0x8000
		self.data.zoomPosition = parseInt(str[0].substring(11, 14), 16) - 0x555
		self.data.focusPosition = parseInt(str[0].substring(14, 17), 16) - 0x555
		self.data.irisPosition = parseInt(str[0].substring(17, 20), 16) - 0x555
	}

	if (str[0].substring(0, 4) === 'uPVS') {
		self.data.presetSpeed = str[0].substring(4)
	}

	if (str[0].substring(0, 2) === 'fS') {
		const speed = parseInt(str[0].substring(2, 4), 10)
		if (Number.isFinite(speed)) self.data.focusSpeedValue = speed - 50
	}

	if (str[0].substring(0, 2) === 'zS') {
		const speed = parseInt(str[0].substring(2, 4), 10)
		if (Number.isFinite(speed)) self.data.zoomSpeedValue = speed - 50
	}

	switch (str[0]) {
		case 'dA0':
			self.data.tally = '0'
			break
		case 'dA1':
			self.data.tally = '1'
			break
		case 'p0': // Standby
			self.data.power = '0'
			break
		case 'p1': // Power ON
			self.data.power = '1'
			break
		case 'p3': // Starting (Standby to Power ON)
			self.data.power = '1'
			break
		case 'p4': // Power OFF
			self.data.power = '0'
			break
		case 'p5': // Reboot
			self.data.power = '1'
			break
		case 'iNS0':
			self.data.installMode = '0'
			break
		case 'iNS1':
			self.data.installMode = '1'
			break
		case 'd10':
			self.data.focusMode = '0'
			break
		case 'd11':
			self.data.focusMode = '1'
			break
		case 'd30':
			self.data.irisMode = '0'
			break
		case 'd31':
			self.data.irisMode = '1'
			break
		case 'd60':
			self.data.nightMode = '0'
			break
		case 'd61':
			self.data.nightMode = '1'
			break
		case 'ER2':
			switch (str[1]) {
				case 'OWS':
					self.data.awbResult = echo ? null : 'NG (Busy)'
					break
				case 'OAS':
					self.data.abbResult = echo ? null : 'NG (Busy)'
					break
			}
			break
		case 'ER3':
			switch (str[1]) {
				case 'OWS':
					self.data.awbResult = echo ? null : 'NG'
					break
				case 'OAS':
					self.data.abbResult = echo ? null : 'NG'
					break
			}
			break
		case 'DCB':
		case 'OBR':
			self.data.colorbar = str[1]
			break
		case 'OCG':
			self.data.chromaLevel = str[1].replace('0x', '')
			break
		case 'OID':
			self.data.modelAuto = str[1]
			if (self.data.modelAuto !== self.data.model) {
				logger.debug('Detected Camera Model: ' + self.data.modelAuto)
			}
			break
		case 'OLR':
		case 'TLR':
			self.data.tally = str[1]
			break
		case 'OLG':
		case 'TLG':
			self.data.tally2 = str[1]
			break
		case 'OLY':
		case 'TLY':
			self.data.tally3 = str[1]
			break
		case 'OAF':
			self.data.focusMode = str[1]
			break
		case 'OAS':
			self.data.abbResult = echo ? null : 'OK'
			break
		case 'OAW':
			self.data.whiteBalance = echo ? str[1] : (self.SERIES?.capabilities.whiteBalance?.confirm?.[str[1]] ?? str[1])
			break
		case 'OER':
			self.data.errorCamera = parseInt(str[1], 16)
			break
		case 'OIF':
			self.data.irisLabel = str[1] === 'FF' ? 'CLOSE' : 'f/' + (parseInt(str[1], 16) / 10).toFixed(1)
			break
		case 'OIS':
			self.data.ois = str[1]
			break
		case 'OSA':
			switch (str[1]) {
				case '87':
					self.data.videoFormat = str[2].replace('0x', '')
					break
				case 'D5':
					self.data.audioVolumeLevels[parseInt(str[2])] = parseInt(str[3], 16) - 0x80
					break
			}
			break
		case 'OSD':
			switch (str[1]) {
				case '3A':
					self.data.dnr = str[2].replace('0x', '')
					break
				case '4F':
					self.data.irisFollowPosition = parseInt(str[2], 16)
					break
				case 'B0':
					self.data.chromaLevel = str[2].replace('0x', '')
					break
				case 'B1':
					self.data.colorTemperature = str[2].replace('0x', '')
					break
			}
			break
		case 'OSK':
			switch (str[1]) {
				case '02':
					self.data.chromaLevel = str[2].replace('0x', '')
					break
				case '03':
					self.data.chromaPhaseValue = parseInt(str[2], 16) - 0x80
					break
				case '05':
					self.data.dnr = str[2].replace('0x', '')
					break
				case '08':
					self.data.shutter = str[2].replace('0x', '')
					break
			}
			break
		case 'OSI':
			switch (str[1]) {
				case '18':
					self.data.zoomPosition = parseInt(str[2], 16) - 0x555
					self.data.focusPosition = parseInt(str[3], 16) - 0x555
					self.data.irisPosition = parseInt(str[4], 16) - 0x555
					break
				case '20':
					self.data.colorTempLabel =
						str[3] === undefined || str[3] === '0'
							? parseInt(str[2], 16).toString() + 'K'
							: '(' + parseInt(str[2], 16).toString() + 'K)'
					break // VAR
				case '30':
					self.data.shootingMode = str[2]
					break
				case '46':
					self.data.errorCameraDetail = parseInt(str[2], 16)
					break
				// case 'D2': self.data.filter = str[2]; break // UB300's additional "Intelligent ND Filter"
			}
			break
		case 'OSH':
			self.data.shutter = str[1].replace('0x', '')
			break
		case 'OSV':
			self.data.version = str[1]
			break
		case 'OFT':
			self.data.filter = str[1]
			break
		case 'OSE':
			switch (str[1]) {
				case '33':
					self.data.drs = str[2]
					break
				case '71':
					self.data.presetScope = str[2]
					break
			}
			break
		case 'OSG':
			switch (str[1]) {
				case '39':
					self.data.redGainValue = parseInt(str[2], 16) - 0x800
					break
				case '3A':
					self.data.blueGainValue = parseInt(str[2], 16) - 0x800
					break
				case '4A':
					self.data.masterPedValue = parseInt(str[2], 16) - 0x80
					break
				case '4C':
					self.data.redPedValue = parseInt(str[2], 16) - 0x800
					break
				case '4D':
					self.data.greenPedValue = parseInt(str[2], 16) - 0x800
					break
				case '4E':
					self.data.bluePedValue = parseInt(str[2], 16) - 0x800
					break
				//case '5D': self.data.shutterStepLabel = str[2].replace('0x', ''); break // UB300 special case
			}
			break
		case 'OSJ':
			switch (str[1]) {
				case '03':
					self.data.shutter = str[2].replace('0x', '')
					break
				case '06':
					self.data.shutterStepLabel = '1/' + parseInt(str[2], 16).toString()
					break
				case '0B':
					self.data.chromaPhaseValue = parseInt(str[2], 16) - 0x80
					break
				//case '0C': break // AWB Gain Offset
				case '0F':
					self.data.masterPedValue = parseInt(str[2], 16) - 0x800
					break
				case '10':
					self.data.greenPedValue = parseInt(str[2], 16) - 0x96
					break
				case '29':
					self.data.presetSpeedUnit = str[2]
					break
				// 35-3B are all sent as update notifications, naming the preset that changed. They arrive
				// whoever made the change, so a rename or a new thumbnail needs no counter sweep to be seen.
				case '35': {
					const idx = presetIndex(str[2])
					if (idx !== null) self.data.presetNames[idx] = str.slice(3).join(':').trim()
					break
				}
				case '36': {
					const idx = presetIndex(str[2])
					if (idx !== null) self.data.presetNames[idx] = undefined
					break
				}
				case '37':
					self.data.presetNames.fill(undefined)
					break
				case '39': {
					const idx = presetIndex(str[2])
					if (idx !== null) self.getThumbnail(idx)
					break
				}
				case '3A': {
					const idx = presetIndex(str[2])
					if (idx !== null) self.data.presetThumbnails[idx] = undefined
					break
				}
				case '3B':
					self.data.presetThumbnails.fill(undefined)
					break
				// The one command here that is query-only, hence the sweep it takes to read it.
				case '3C':
					applyPresetCounters(self, parseInt(str[2].replace('0x', ''), 16), str[3])
					break
				case '4A':
					self.data.awbColorTempLabel =
						(str[3] === '1' ? '<' : str[3] === '2' ? '>' : '') + parseInt(str[2], 16).toString() + 'K'
					break
				case 'D2':
					self.data.filterFollow = str[2]
					break
			}
			break
		case 'OSL':
			switch (str[1]) {
				case '25':
					self.data.gain = str[2].replace('0x', '').padStart(2, '0') // same encoding as OGU/OGS
					break
				case '36':
					self.data.redGainValue = parseInt(str[2], 16) - 0x800
					break
				case '37':
					self.data.greenGainValue = parseInt(str[2], 16) - 0x800
					break
				case '38':
					self.data.blueGainValue = parseInt(str[2], 16) - 0x800
					break
				case 'B6':
					self.data.autotrackingMode = str[2]
					break
				case 'B7':
					self.data.autotrackingAngle = str[2]
					break
				case 'BB':
					self.data.autotrackingStatus = str[2]
					self.data.autotrackingEnabled = str[2] !== '0' ? '1' : '0'
					break
			}
			break
		case 'OGS':
		case 'OGU':
			self.data.gain = str[1].replace('0x', '').padStart(2, '0')
			break
		case 'ORS':
			self.data.irisMode = str[1]
			break
		case 'ORV':
			self.data.irisPosition = parseInt(str[1], 16)
			break
		case 'OTD':
			self.data.masterPedValue = parseInt(str[1], 16) - 0x1e
			break
		case 'OTP':
			self.data.masterPedValue = parseInt(str[1], 16) - 0x96
			break
		case 'ORG':
			self.data.redGainValue = parseInt(str[1], 16) - 0x1e
			break
		case 'OBG':
			self.data.blueGainValue = parseInt(str[1], 16) - 0x1e
			break
		case 'ORI':
			self.data.redGainValue = parseInt(str[1], 16) - 0x96
			break
		case 'OBI':
			self.data.blueGainValue = parseInt(str[1], 16) - 0x96
			break
		case 'ORP':
			self.data.redPedValue = parseInt(str[1], 16) - 0x96
			break
		case 'OBP':
			self.data.bluePedValue = parseInt(str[1], 16) - 0x96
			break
		case 'OWS':
			self.data.awbResult = echo ? null : 'OK'
			break
		case 'TITLE':
			self.data.title = str[1]
			break
	}
}

export function parseWeb(self, str, cmd) {
	switch (cmd) {
		case 'get_basic':
			if (str[0] === 'cam_title') self.data.title = str[1]
			break
		case 'get_rtmp_status':
			if (str[0] === 'status') self.data.rtmp = str[1]
			break
		case 'get_srt_status':
			if (str[0] === 'status') self.data.srt = str[1]
			break
		case 'get_ts_status':
			if (str[0] === 'status') self.data.ts = str[1]
			break
		case 'get_state':
			switch (str[0]) {
				case 'rec':
					self.data.recording = str[1] === 'on' ? '1' : '0'
					break
				case 'sd_insert':
					self.data.sdInserted = str[1] === 'on' ? '1' : '0'
					break
				case 'sd2_insert':
					self.data.sd2Inserted = str[1] === 'on' ? '1' : '0'
					break
			}
			break
		case 'getinfo?FILE=1':
			switch (str[0]) {
				case 'MAC':
					self.data.mac = str[1]
					break
				case 'SERIAL':
					self.data.serial = str[1]
					break
				case 'VERSION':
					self.data.version = str[1]
					break
				case 'NAME':
					self.data.modelAuto = str[1]
					if (self.data.modelAuto !== self.data.model) {
						logger.debug('Detected Camera Model: ' + self.data.modelAuto)
					}
					break
			}
			break
	}
}

// These control CGIs answer with a status code and no body, so the code is the whole reply. Only 204
// says the camera did it. 503 used to be accepted here too, as if it were a second flavour of "no
// content", but it is the opposite: these cameras answer 503 when the command's precondition does not
// hold — SRT control while RTMP is the selected protocol, a record command with the card not ready.
export function parseWebCode(self, code, cmd) {
	if (code === 204) {
		switch (cmd) {
			case 'srt_ctrl?cmd=start':
				self.data.srt = '1'
				break
			case 'srt_ctrl?cmd=stop':
				self.data.srt = '0'
				break
			case 'ts_ctrl?cmd=start':
				self.data.ts = '1'
				break
			case 'ts_ctrl?cmd=stop':
				self.data.ts = '0'
				break
			case 'rtmp_ctrl?cmd=start':
				self.data.rtmp = '1'
				break
			case 'rtmp_ctrl?cmd=stop':
				self.data.rtmp = '0'
				break
			case 'sdctrl?save=start':
				self.data.recording = '1'
				break
			case 'sdctrl?save=end':
				self.data.recording = '0'
				break
			case 'initial?cmd=reset&Randomnum=12345':
				self.data.power = '0'
				break
		}
	}
}
