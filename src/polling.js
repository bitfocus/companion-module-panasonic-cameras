// Maps each transport group of a model's pull/poll capabilities to the instance method that queries it.
const transports = { ptz: 'getPTZ', cam: 'getCam', web: 'getWeb' }

export async function pollCameraStatus(self) {
	while (self.poll) {
		// When subscription is disabled, also poll the data it would otherwise push (pull).
		// The additional data (poll) is always queried, regardless of subscription.
		const groups = self.config.subscriptionEnable
			? [self.SERIES.capabilities.poll]
			: [self.SERIES.capabilities.pull, self.SERIES.capabilities.poll]

		for (const caps of groups) {
			if (!caps) continue
			for (const [key, method] of Object.entries(transports)) {
				for (const cmd of caps[key] || []) {
					if (!self.poll) return
					await self[method](cmd)
					if (!self.poll) return
					await sleep(self.config.pollDelay)
				}
			}
		}
	}
}

// One-shot query of all data defined by the model's pull and poll capabilities.
// Functional, capability-driven alternative to getAllCameraStatus for use at initialisation.
export async function getCameraStatusOnce(self) {
	for (const caps of [self.SERIES.capabilities.pull, self.SERIES.capabilities.poll]) {
		if (!caps) continue
		for (const [key, method] of Object.entries(transports)) {
			for (const cmd of caps[key] || []) await self[method](cmd)
		}
	}
}

export async function getAllCameraStatus(self) {
	const cmds = {
		ptz: [
			'O', // Power
			'PE00', // Preset Entry 0
			'PE01', // Preset Entry 1
			'PE02', // Preset Entry 2
			'AXF', // Focus Position Control
			'AXI', // Iris Position Control
			'AXZ', // Zoom Position Control
			'GF', // Request Focus Position
			'GI', // Request Iris Position (+Mode)
			'GZ', // Request Zoom Position
			'I', // Iris Position (1-99)
			//'D1', // Focus Mode
			//'D3', // Iris Mode
			'D6', // Night Mode
			'DA', // Tally
			'INS', // Installation Position
			//'LPC', // Lens Position Information Control
			'LPI', // Lens Position
			'PST', // Preset Speed Table
			'PTD', // Get Pan/Tilt/Zoom/Focus/Iris
			'PTG', // Get Gain/ColorTemp/Shutter/ND
			'PTV', // Get Pan/Tilt/Zoom/Focus/Iris
			'RER', // Latest Error Information
			'S', // Request Latest Recall Preset No.
			'TAA', // Tally Infomation
			'UPVS', // Preset Speed
		],
		cam: [
			'QAF', // Focus Mode
			'QAW', // White Balance Mode
			'QBR', // Color Bar
			'QBI', // B Gain
			'QBP', // B Pedestal
			'QGB', // B Gain
			'QBD', // B Pedestal
			'QCG', // Chroma Level
			'QFT', // ND Filter
			'QGS', // Gain Select (UB300 only)
			'QGU', // Gain
			'QID', // Model Number
			'QIF', // Request Iris F No.
			'QIS', // OIS
			'QRI', // R Gain
			'QRP', // R Pedestal
			'QGR', // R Gain
			'QRD', // R Pedestal
			'QRS', // Iris Mode
			'QRV', // Iris Volume (0x0-0x3FF)
			'QSH', // Shutter
			'QSV', // Software Version
			'QTD', // T Pedestal
			'QTP', // T Pedestal
			'QLR', // R-Tally Control
			'QLG', // G-Tally Control
			'QLY', // Y-Tally Control
			'QSA:87', // Video Format
			'QSA:D5:0', // Audio Volume Level Ch 1
			'QSA:D5:1', // Audio Volume Level Ch 2
			'QSA:D5:2', // Audio Volume Level Ch 3
			'QSA:D5:3', // Audio Volume Level Ch 4
			'QSD:3A', // Digital Noise Reduction
			'QSD:4F', // Iris Follow
			'QSD:B0', // Chroma Level
			'QSD:B1', // Color Temperature (enumerated)
			'QSE:33', // Dynamic Range Stretch
			'QSE:71', // Preset Scope
			'QSG:39', // R Gain
			'QSG:3A', // B Gain
			'QSG:4A', // Master Pedestal (UB300 only)
			'QSG:4C', // R Pedestal (UE160/UB300 only)
			'QSG:4D', // G Pedestal (UE160 only)
			'QSG:4E', // B Pedestal (UE160/UB300 only)
			'QSG:59', // Shutter SW
			'QSG:5A', // Shutter Mode
			'QSG:5D', // Shutter Speed (UB300 only)
			'QSI:18', // Request Zoom/Focus/Iris Position
			'QSI:19:0', // Software Version, System Version (UB300 only)
			'QSI:20', // Color Temperature
			'QSJ:03', // Shutter Mode
			'QSJ:06', // Shutter Step Value
			'QSJ:09', // Shutter Synchro Value
			'QSJ:0B', // Chroma Phase
			'QSJ:0F', // Master Pedestal
			'QSJ:10', // G Pedestal
			'QSJ:29', // Preset Speed Unit
			'QSJ:5C', // Camera Title
			'QSJ:D2', // ND Filter Status
			'QSL:2A', // ATW
			'QSL:2B', // White Balance Mode
			'QSL:8B', // O.I.S.
			'QSL:8C', // O.I.S. Mode
			'QSL:99', // System Version
			'QSL:B6', // Auto Tracking Mode
			'QSL:B7', // Angle
			'QSL:BB', // Tracking Status
		],
		web: ['get_state', 'get_rtmp_status', 'get_srt_status', 'get_ts_status'],
	}

	for (const [key, method] of Object.entries(transports)) {
		for (const cmd of cmds[key] || []) await self[method](cmd)
	}
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
