import { sleep } from './common.js'

// Maps each transport group of a model's pull/poll capabilities to the instance method that queries it.
const transports = { ptz: 'getPTZ', cam: 'getCam', web: 'getWeb' }

// The `poll` flag alone cannot say whether this loop is still the wanted one, and never could: a
// teardown clears it, the re-initialisation that follows sets it again, and a loop parked in an await
// across those two wakes up to a flag that reads true. It then runs alongside the loop the
// re-initialisation started — one more camera-hammering loop per reconnect, forever. The token is what
// distinguishes "still running" from "running again".
export async function pollCameraStatus(self) {
	const generation = ++self.pollGen
	const alive = () => self.poll && self.pollGen === generation

	while (alive()) {
		// When subscription is disabled, also poll the data it would otherwise push (pull).
		// The additional data (poll) is always queried, regardless of subscription.
		const groups = self.config.subscriptionEnable
			? [self.SERIES.capabilities.poll]
			: [self.SERIES.capabilities.pull, self.SERIES.capabilities.poll]

		for (const caps of groups) {
			if (!caps) continue
			for (const [key, method] of Object.entries(transports)) {
				for (const cmd of caps[key] || []) {
					if (!alive()) return
					await self[method](cmd)
					if (!alive()) return
					await sleep(self.config.pollDelay)
				}
			}
		}
	}
}

// A feedback that is still on a button re-registers itself every time it is evaluated, and getImage()
// evaluates every placed instance after each frame — so a live subscriber refreshes its timestamp
// each cycle and only a departed one goes quiet. unsubscribe() covers the normal removal; this
// catches the paths it never fires on (page import, a moved control), so a lost subscriber costs a
// few wasted frames rather than polling the camera forever.
function pruneImageSubscribers(self) {
	const deadline = Date.now() - 3 * self.config.imageInterval - self.config.timeout

	for (const [id, seen] of self.imageSubscribers) {
		if (seen < deadline) self.imageSubscribers.delete(id)
	}
}

// The live image runs on its own loop rather than inside pollCameraStatus: it is fetched every second
// or so where status commands go out every few hundred milliseconds, and a full-size frame takes long
// enough that interleaving the two would stall every status command queued behind it.
//
// Module API 2.0 removed the feedback subscribe hook, so there is nothing to hook: the loop runs
// while — and only while — a button is asking for the image, which the feedback's own callback says
// by registering itself on every evaluation (see feedbacks.js).
export async function pollLiveImage(self) {
	const generation = ++self.pollImageGen // a loop from before a re-init must not outlive it

	while (self.pollImage && self.pollImageGen === generation) {
		pruneImageSubscribers(self)
		if (self.imageSubscribers.size === 0) break

		await self.getImage()
		if (!self.pollImage || self.pollImageGen !== generation) return

		// Back off while the camera is not answering rather than hammering it once a second.
		await sleep(self.config.imageInterval * (self.imageErrors ? 5 : 1))
	}

	if (self.pollImageGen === generation) self.pollImage = false
}

// Started from the feedback's callback: the first button to show the image starts the loop, and the
// re-entrancy guard is why the many evaluations that follow do not each start another.
export function startLiveImagePoll(self) {
	if (self.pollImage) return
	if (!self.SERIES?.capabilities.imageTransmission || !self.config.imageEnable) return

	self.pollImage = true

	pollLiveImage(self).catch((err) => {
		self.pollImage = false
		self.log('error', 'Live image polling stopped: ' + String(err))
	})
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

// Exhaustive, hand-written query of every command this protocol knows, kept deliberately even
// though nothing calls it: it is the reference used when bringing up a new camera model, to see
// what the device answers before the capability tables in models.js are filled in.
// Do not delete as "dead code" — getCameraStatusOnce above is the runtime path.
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
