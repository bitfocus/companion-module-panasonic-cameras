export async function pollCameraStatus(self) {
	// Use an interval-based approach instead of recursive calls
	if (self.pollIntervalId) {
		clearInterval(self.pollIntervalId)
	}

	const pollOnce = async () => {
		// Check if aborted instead of using self.poll
		if (self.abortController.signal.aborted) {
			if (self.pollIntervalId) {
				clearInterval(self.pollIntervalId)
				self.pollIntervalId = null
			}
			return
		}

		try {
			// Poll all remaining data if subscription is disabled
			if (!self.config.subscriptionEnable) {
				await executeCommands(self, self.SERIES.capabilities.pull)
			}

			// Poll additional data which is not covered by subscription
			await executeCommands(self, self.SERIES.capabilities.poll)
		} catch (err) {
			if (self.config.debug) {
				self.log('debug', 'Polling error: ' + String(err))
			}
		}
	}

	// Start interval-based polling
	self.pollIntervalId = setInterval(pollOnce, self.config.pollDelay || 1000)

	// Execute first poll immediately
	await pollOnce()
}

async function executeCommands(self, capabilities) {
	if (!capabilities || self.abortController.signal.aborted) return

	const commandGroups = [
		{ type: 'ptz', commands: capabilities.ptz, method: self.getPTZ.bind(self) },
		{ type: 'cam', commands: capabilities.cam, method: self.getCam.bind(self) },
		{ type: 'web', commands: capabilities.web, method: self.getWeb.bind(self) },
	]

	for (const group of commandGroups) {
		if (!group.commands || self.abortController.signal.aborted) continue

		for (const cmd of group.commands) {
			if (self.abortController.signal.aborted) return // Check before each command

			try {
				await group.method(cmd)

				// Use a promise-based delay that can be cancelled
				if (!self.abortController.signal.aborted && self.config.pollDelay > 0) {
					await sleep(self.config.pollDelay, self.abortController.signal)
				}
			} catch (err) {
				if (err.name === 'AbortError') {
					return // Polling was cancelled
				}
				// Continue with next command on other errors
				if (self.config.debug) {
					self.log('debug', `Error polling ${group.type} command ${cmd}: ${String(err)}`)
				}
			}
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
			'QSD:4F', // Iris Follow
			'QSD:B1', // Color Temperature (enumerated)
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

	await executeCommands(self, cmds)
}

function sleep(ms, signal) {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(resolve, ms)

		if (signal) {
			signal.addEventListener('abort', () => {
				clearTimeout(timeout)
				reject(new Error('AbortError'))
			})
		}
	})
}
