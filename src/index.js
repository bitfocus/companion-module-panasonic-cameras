import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { upgradeScripts } from './upgrades.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getPresetDefinitions } from './presets.js'
import { setVariables, checkVariables } from './variables.js'
import { ConfigFields, applyConfigDefaults, describeDetectedModel } from './config.js'
import * as net from 'net'
import got from 'got'
import { Jimp, JimpMime } from 'jimp'
import EventEmitter from 'events'
import { getAndUpdateSeries, fitImage, raceTimeout } from './common.js'
import { initialData } from './data.js'
import { extractUpdates, MAX_BUFFER } from './framing.js'
import { parseUpdate, parseWeb, parseWebCode } from './parser.js'
import { pollCameraStatus, getCameraStatusOnce } from './polling.js'

// ########################
// #### Instance setup ####
// ########################
export const UpgradeScripts = upgradeScripts

// Max wait for a goodbye ack before tearing down anyway; a gone camera never answers.
const UNSUBSCRIBE_GRACE = 1000

// Temporary reachability faults worth retrying; the DNS codes cover cameras entered by hostname.
// Anything not listed is not retried.
export const REACHABILITY_ERRORS = new Set([
	'ETIMEDOUT',
	'ECONNABORTED',
	'ECONNREFUSED',
	'ECONNRESET',
	'EHOSTDOWN',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'ENOTFOUND', // hostname does not resolve
	'EAI_AGAIN', // DNS is temporarily unreachable
])

// Consecutive reachability failures before the connection counts as lost
const FAILURE_THRESHOLD = 3

// HTTP rejections that say the request will never work as sent, as opposed to "not on this model".
// Both are conditions an operator can fix, so both get a status of their own.
const AUTH_REJECTIONS = {
	401: InstanceStatus.AuthenticationFailure,
	403: InstanceStatus.InsufficientPermissions,
}

// Lead with the code: got carries it in `code` and does not always repeat it in the message. The
// String() fallback keeps a thrown non-Error from reading as "[object Object]".
export function describeError(err) {
	const message = err?.message || String(err)

	return err?.code ? `${err.code}: ${message}` : message
}

const hexdump = (buffer) => buffer.subarray(0, 96).toString('hex').replace(/(..)/g, '$1 ').trim()

export default class PanasonicCameraInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		// Must exist before init(): destroy() may run on an instance whose init() never completed.

		// Identity of the current connection; teardown() bumps it so stale in-flight work discards itself.
		this.generation = 0

		// One handle for teardown() to cancel every request at once; fresh controller per generation.
		this.aborter = new AbortController()

		this.clients = []
		this.poll = false
		this.pollGen = 0
		this.pollImage = false
		this.pollImageGen = 0

		// Consecutive reachability failures; a success resets it (see onRequestSucceeded()).
		this.failures = 0

		// True from the moment a reconnect is committed until it starts, so nothing withdraws it.
		this.reconnecting = false

		// Last status handed to Companion, so setStatus() can drop a repeat (see there).
		this.reportedStatus = undefined
	}

	// De-duplicates the status
	setStatus(status, message = null) {
		const reported = JSON.stringify([status, message])
		if (reported === this.reportedStatus) return

		this.reportedStatus = reported
		this.updateStatus(status, message)
	}

	// True while `generation` is still the running connection.
	current(generation) {
		return generation === this.generation
	}

	// One camera line is one parse. Contained here, a line the parser chokes on costs that line and
	// not the 390 behind it in a bulk dump — and, more importantly, never leaves the parse inside the
	// request's try, where a TypeError carrying no `err.code` reached handleConnectionError and was
	// reported to the operator as a camera fault, with the connection deadened and no retry armed.
	parseSafely(line, parse) {
		try {
			parse()
		} catch (err) {
			this.log('error', `Failed to parse camera response "${line}": ${describeError(err)}`)
		}
	}

	// Protocol detail, logged at debug so Companion filters it: nothing here belongs in an operator's
	// log, but all of it belongs in a support bundle. `trace` marks the lines a repeating loop emits —
	// those are suppressed unless asked for.
	traced(trace, message) {
		if (!trace || this.config.trace) this.log('debug', message)
	}

	// All requests go through here so teardown()'s abort signal is never missed.
	httpGet(url, options = {}) {
		return got.get(url, {
			timeout: { request: this.config.timeout },
			...options,
			signal: this.aborter.signal, // last, so callers cannot override
		})
	}

	// Undo everything that can reach the camera. Takes config because the caller may be replacing this.config.
	async teardown(config = this.config) {
		// 1. Stop new work; bumping loop tokens wakes loops parked in a sleep.
		this.poll = false
		this.pollImage = false
		this.pollGen++
		this.pollImageGen++
		this.timeoutID = clearTimeout(this.timeoutID) // a retry owed to the old connection is not the new one's
		this.reconnecting = false // ...and neither is the reconnect that retry was committed to

		// 2. Invalidate in-flight work (see current()) and cancel it so it drops the old camera's socket.
		this.generation++
		this.aborter.abort()
		this.aborter = new AbortController() // the goodbye below needs a live one

		// 3. Tell the old camera to stop pushing (only if subscribed; this.server proves it). Awaited but
		//    bounded: the stop must land before the next start, yet a gone camera must not stall the panel.
		if (this.server) {
			const goodbye = this.unsubscribeTCPEvents(this.tcpPortSelected, config)
			await raceTimeout(goodbye, Math.min(config.timeout, UNSUBSCRIBE_GRACE))
		}

		// 4. close() only stops accepting new connections; existing camera sockets survive it and must be
		//    destroyed by hand.
		for (const socket of this.clients) socket.destroy()
		this.clients = []

		if (this.server) {
			this.server.close()
			delete this.server
		}
	}

	async destroy() {
		await this.teardown()
	}

	// Takes config explicitly: this goodbye targets the connection being left behind, not this.config.
	async unsubscribeTCPEvents(port, config = this.config) {
		const url = `http://${config.host}:${config.httpPort}/cgi-bin/event?connect=stop&my_port=${port}&uid=0`

		this.log('debug', 'TCP unsubscription request: ' + url)

		try {
			await this.httpGet(url, { timeout: { request: config.timeout } })

			this.log('debug', 'un-subscribed: ' + url)
		} catch (err) {
			// Not handleConnectionError(): a failed goodbye to a dismantled connection looks like an absent
			// camera, and treating it as reconnectable would re-init an instance already being deleted.
			this.log('debug', 'TCP unsubscribe failed (the camera may already be gone): ' + String(err))
		}
	}

	async subscribeTCPEvents(port) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/event?connect=start&my_port=${port}&uid=0`

		this.log('debug', 'TCP subscription request: ' + url)

		try {
			await this.httpGet(url)
			if (!this.current(generation)) return // old camera's hello must not mark the new one Ok

			this.log('debug', 'subscribed: ' + url)

			this.onRequestSucceeded()

			await this.getPTZ('LPC1') // enable Lens Position Information updates
		} catch (err) {
			if (!this.current(generation)) return
			this.logConnectionError(err, 'Error on subscribe: ' + String(err))
		}
	}

	// Only ever reached with no server running: reInitAll() tears the previous connection down first.
	init_tcp() {
		const generation = this.generation // a socket accepted for a gone connection is not ours

		var tcpPortSelected = this.tcpPortSelected || 31004

		if (this.config.host) {
			this.server = net.createServer((socket) => {
				socket.name = socket.remoteAddress + ':' + socket.remotePort
				socket.buffer = Buffer.alloc(0) // bytes received but not yet a whole notification
				this.clients.push(socket)

				// 'close' always fires; 'end' does not on a socket we destroy ourselves (as teardown() does).
				socket.on('close', () => {
					// Guard indexOf === -1: splice(-1, 1) would drop an unrelated current socket.
					const index = this.clients.indexOf(socket)
					if (index !== -1) this.clients.splice(index, 1)
				})

				socket.on('error', () => {
					this.log('error', 'Update notification channel errored/died: ' + socket.name)
				})

				socket.on('data', (data) => {
					// A push for a torn-down connection is the old camera's; discard it and close the socket.
					if (!this.current(generation)) return socket.destroy()

					// A chunk is not a message: accumulate and frame notifications out of it (see framing.js).
					socket.buffer = Buffer.concat([socket.buffer, data])

					const raw = socket.buffer
					const { updates, rest, desync } = extractUpdates(raw)
					socket.buffer = rest

					// Lost the framing: drop the buffer rather than read the next chunk against a lost stream.
					if (desync || socket.buffer.length > MAX_BUFFER) {
						this.log(
							'error',
							`Update notification stream out of sync, discarding buffer (${socket.name}, at byte ` +
								`${raw.length - rest.length} of ${raw.length}): ${hexdump(rest)}`,
						)
						socket.buffer = Buffer.alloc(0)
					}

					for (const { command, source } of updates) {
						// Trace: the camera pushes these continuously, at the rate it changes state.
						// `source` (sender address + clock) is logged only to help place a stray notification.
						if (this.config.trace) {
							this.log('debug', `Received Update: ${command}  (${source})`)
						}

						this.parseSafely(command, () => parseUpdate(this, command.split(':')))
					}

					// Once for the whole batch: a coalesced burst is one redraw.
					if (updates.length) {
						// A subscription-only camera may make no HTTP requests for minutes, so without this
						// one failed request would sit at failures > 0 until the fallback declared a
						// connection lost that has been pushing updates the whole time.
						this.markReachable()

						this.checkVariables()
						this.checkAllFeedbacks()
					}
				})
			})

			this.server.on('error', (err) => {
				if (err.code === 'EADDRINUSE') {
					this.log('error', 'TCP error: Please use another TCP port, ' + tcpPortSelected + ' is already in use')
					this.log('error', 'TCP error: The TCP port must be unique between instances')
					this.log('error', 'TCP error: Please change it and click apply in ALL camera instances')
					this.setStatus(InstanceStatus.UnknownError, 'TCP Port in use')

					// Nothing was ever subscribed on this port, so there is nothing to say goodbye to. The
					// server must still go: teardown() reads `this.server` as proof of a subscription and
					// would send a stop for a port the camera was never told about.
					this.server.close()
					delete this.server
				} else {
					this.log('error', 'TCP server error: ' + String(err))
				}
			})

			try {
				this.log('debug', 'Trying to listen to TCP from camera')

				if (!this.config.portManual) {
					this.server.listen(0)
				} else {
					this.server.listen(this.config.tcpPort)
				}
				tcpPortSelected = this.server.address().port
				this.tcpPortSelected = tcpPortSelected

				this.log('debug', 'Listening for camera updates on localhost:' + tcpPortSelected)

				this.subscribeTCPEvents(tcpPortSelected)
			} catch (err) {
				this.log('error', "Couldn't bind to TCP port " + tcpPortSelected + ' on localhost: ' + String(err))
				this.setStatus(InstanceStatus.UnknownError, 'TCP Port failure')
			}
		}

		return this
	}

	async getCameraStatus() {
		if (this.config.host) {
			const generation = this.generation
			const url = `http://${this.config.host}:${this.config.httpPort}/live/camdata.html`

			this.log('debug', 'camdata request: ' + url)

			try {
				const response = await this.httpGet(url)
				// The camera that answered may no longer be the one we are connected to.
				if (!this.current(generation)) return

				if (response.body) {
					const lines = response.body.trim().split('\r\n')

					for (let line of lines) {
						const str = line.replace(':0x', ':').trim()

						// Trace: one line per reading, and the bulk dump is a few hundred of them.
						if (this.config.trace) {
							this.log('debug', 'camdata response: ' + str)
						}

						this.parseSafely(str, () => parseUpdate(this, str.split(':')))
					}

					this.checkVariables()
					this.checkAllFeedbacks()

					this.onRequestSucceeded()
				}
			} catch (err) {
				// The old camera's failure must not schedule a reconnect for the current one.
				if (!this.current(generation)) return
				this.logConnectionError(err, 'camdata request  ' + url + ' failed: ' + String(err))
			}
		}
	}

	// `trace` marks a call the poll loop makes on repeat; those are logged only in trace mode, while
	// the same command sent by an action stays at plain debug (see traced()).
	async getPTZ(cmd, { trace = false } = {}) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_ptz?cmd=%23${cmd}&res=1`

		this.traced(trace, 'PTZ request: ' + url)

		try {
			const response = await this.httpGet(url)
			if (!this.current(generation)) return

			if (response.body) {
				const str = response.body.trim()

				this.traced(trace, 'PTZ response: ' + str)

				this.parseSafely(str, () => parseUpdate(this, str.split(':')))

				this.checkVariables()
				this.checkAllFeedbacks()

				this.onRequestSucceeded()

				return str // hand back for the Custom Command action
			}
		} catch (err) {
			if (!this.current(generation)) return
			this.logConnectionError(err, 'PTZ request ' + url + ' failed: ' + String(err))
		}
	}

	async getCam(cmd, { trace = false } = {}) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_cam?cmd=${cmd}&res=1`

		this.traced(trace, 'Cam request: ' + url)

		try {
			const response = await this.httpGet(url)
			if (!this.current(generation)) return

			if (response.body) {
				const str = response.body.trim()

				this.traced(trace, 'Cam response: ' + str)

				this.parseSafely(str, () => parseUpdate(this, str.split(':')))

				this.checkVariables()
				this.checkAllFeedbacks()

				this.onRequestSucceeded()

				return str // hand back for the Custom Command action
			}
		} catch (err) {
			if (!this.current(generation)) return
			this.logConnectionError(err, 'Cam request ' + url + ' failed: ' + String(err))
		}
	}

	// Only for web commands that don't require admin rights.
	async getWeb(cmd, { username = '', password = '', trace = false } = {}) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/${cmd}`

		this.traced(trace, 'Web request: ' + url)

		try {
			const response = await this.httpGet(url, { username, password })
			if (!this.current(generation)) return

			if (response.body) {
				const lines = response.body.trim().split('\r\n')

				for (let line of lines) {
					const str = line.trim()

					this.traced(trace, 'Web response [' + cmd + ']: ' + str)

					this.parseSafely(str, () => parseWeb(this, str.split('='), cmd))
				}
			} else {
				this.traced(trace, 'Web response [' + cmd + ']: Response code ' + response.statusCode.toString())

				this.parseSafely(response.statusCode, () => parseWebCode(this, response.statusCode, cmd))
			}

			this.checkVariables()
			this.checkAllFeedbacks()

			this.onRequestSucceeded()

			// hand back for the Custom Command action
			return response.body ? response.body.trim() : `Response code ${response.statusCode}`
		} catch (err) {
			if (!this.current(generation)) return
			this.logConnectionError(err, 'Web request ' + url + ' failed: ' + String(err))
		}
	}

	async getThumbnail(id) {
		if (this.SERIES?.capabilities.presetThumbnails) {
			const generation = this.generation
			const n = id + 1
			const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/get_preset_thumbnail?preset_number=${n}`

			// Not traced: fetched once per preset when the camera reports the thumbnail changed, not on repeat.
			this.log('debug', 'Thumbnail request: ' + url)

			try {
				const response = await this.httpGet(url)

				// rawBody is a plain Uint8Array, which Jimp would mistake for a URL
				const img = await Jimp.read(Buffer.from(response.rawBody))
				const png64 = await fitImage(img, this.config.imageScaling).getBase64(JimpMime.png)

				// Re-checked after the slow decode: a config change may have landed while Jimp worked.
				if (!this.current(generation)) return

				this.data.presetThumbnails[id] = png64

				this.checkAllFeedbacks()

				this.onRequestSucceeded()
			} catch (err) {
				if (!this.current(generation)) return
				if (err.code !== 'ERR_ABORTED') this.log('error', 'Thumbnail request ' + url + ' failed: ' + String(err))
			}
		}
	}

	// One image per instance; needs no login, frame size set by the camera (aw_ptz #RZL, or the WEB
	// menu on the models whose one-shot lives on /cgi-bin/camera).
	async getImage() {
		const image = this.SERIES?.capabilities.imageTransmission
		if (!image || !this.config.imageEnable) return

		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/${image.cmd}`

		// Always traced: the only caller is pollLiveImage, once per imageInterval for as long as a
		// button shows the feed.
		this.traced(true, 'Image request: ' + url)

		try {
			// A full frame is budgeted by the refresh interval, but never below the configured timeout.
			const response = await this.httpGet(url, {
				timeout: { request: Math.max(this.config.timeout, this.config.imageInterval) },
			})

			// got returns rawBody as a plain Uint8Array, which Jimp would mistake for a URL
			const img = await Jimp.read(Buffer.from(response.rawBody))

			// Re-checked after the decode: old camera's frame must not paint the new one's buttons.
			if (!this.current(generation)) return

			this.data.image = await fitImage(img, this.config.imageScaling).getBase64(JimpMime.png)
			this.imageErrors = 0

			this.checkFeedbacks('liveImage')
		} catch (err) {
			if (!this.current(generation)) return

			// Not handleConnectionError(): a dropped frame is no evidence the control connection is gone.
			// Log only the first of a streak, else a frame/second failure floods the log.
			if (this.imageErrors++ === 0) this.log('error', 'Image request ' + url + ' failed: ' + String(err))

			// Drop the frozen frame once the failure is more than a blip.
			if (this.imageErrors === 3) {
				this.data.image = null
				this.checkFeedbacks('liveImage')
			}
		}
	}

	// Initalize module
	async init(config) {
		// Fill fields absent from stored config with panel defaults, so downstream needs no fallback.
		this.config = applyConfigDefaults(config)

		this.data = initialData()

		// Must exist before setFeedbackDefinitions() so the first evaluation can reach it.
		this.imageSubscribers = new Map() // feedback instance id -> when it last asked for the image
		this.imageErrors = 0

		this.ptSpeed = 25
		this.pSpeed = 25
		this.tSpeed = 25
		this.zSpeed = 25
		this.fSpeed = 25

		this.tcpPortSelected = 31004

		// Before reInitAll: the actions it builds reach for this.
		this.speedChangeEmitter = new EventEmitter()

		await this.reInitAll()
	}

	async configUpdated(config) {
		const updated = applyConfigDefaults(config)

		this.setStatus(InstanceStatus.Disconnected, 'Config changed')

		// The OLD config: the camera being left behind must be told to stop pushing, at its own address.
		await this.teardown(this.config)

		// Nothing the old camera reported is true of the new one; wipe it or its readings would persist.
		this.data = initialData()
		this.config = updated

		// No delay needed: teardown() is a real barrier, so nothing is left to wait out.
		await this.reInitAll()
	}

	// Evidence the camera is reachable, from anything short of a completed request: an HTTP error the
	// camera itself produced, or a framed batch arriving over the subscription. Ends the failure
	// streak and withdraws the fallback retry armed for it, but says nothing about the status.
	//
	// Refuses once a reconnect is committed: scheduleReInit() has already stopped the poll loops and
	// only reInitAll() starts them again, so cancelling its timer here would leave the connection
	// reporting Ok with its monitoring permanently dead. Returns whether it took effect.
	markReachable() {
		if (this.reconnecting) return false

		this.failures = 0
		this.timeoutID = clearTimeout(this.timeoutID)
		return true
	}

	// Every request that reached the camera ends here: the connection is up, so the failure streak is
	// over and any retry owed to it is withdrawn. Without this a single dropped keep-alive left a
	// re-init armed that fired minutes later against a connection that had long since recovered.
	onRequestSucceeded() {
		if (this.markReachable()) this.setStatus(InstanceStatus.Ok)
	}

	// What every failed request goes through: the classifier below decides how bad it is, the caller
	// supplies the message because only it knows which request failed.
	logConnectionError(err, message) {
		const level = this.handleConnectionError(err)
		if (level) this.log(level, message)
	}

	// Classifies a failed request, moves the connection status with it, and returns the level the
	// caller should log at — or null for nothing.
	handleConnectionError(err) {
		// Cancelled by teardown(), not a camera failure; got raises it as ERR_ABORTED.
		if (err.code === 'ERR_ABORTED') return 'debug'

		// Unreachable: keep re-initialising until it comes back, but only once it is more than a blip.
		if (REACHABILITY_ERRORS.has(err.code)) {
			this.failures++

			if (this.failures >= FAILURE_THRESHOLD) {
				this.scheduleReInit(String(err.code))
				return 'error'
			}

			// Not yet evidence the camera is gone
			this.armFallbackRetry(String(err.code))

			// Amber for as long as the streak lasts
			this.setStatus(InstanceStatus.UnknownWarning, String(err.code))

			// A request that never reached the camera is a fault
			return 'error'
		}

		// Camera answered but rejected the request; not a connection problem — and an answer is proof
		// the camera is there, so it ends any streak a reachability error had started.
		if (err.code === 'ERR_NON_2XX_3XX_RESPONSE') {
			this.markReachable()

			// Credentials are the one rejection an operator can do something about
			const status = AUTH_REJECTIONS[err.response?.statusCode]
			if (status) {
				this.setStatus(status, `HTTP ${err.response.statusCode}`)
				return 'error'
			}

			// Everything else here is the camera declining a command it does not implement
			return 'debug'
		}

		// No code at all is one of ours, not the camera's: got labels everything it raises. Saying so
		// is the difference between the operator chasing a network fault and reporting a module bug.
		if (err?.code === undefined) {
			this.setStatus(InstanceStatus.UnknownError, 'Module error: ' + describeError(err))
			return 'error'
		}

		// Undiagnosed fault: stop rather than retry-loop against it.
		this.setStatus(InstanceStatus.UnknownError, describeError(err))
		return 'error'
	}

	// Sub-threshold failures leave the connection alone but must not leave it unattended: if nothing
	// drives another request, this is what eventually notices the camera never came back.
	armFallbackRetry(reason) {
		if (this.timeoutID) return // one failure already armed it; a success clears it

		this.timeoutID = setTimeout(() => {
			this.timeoutID = undefined
			if (this.failures > 0) this.scheduleReInit(reason)
		}, this.config.timeout + this.config.pollDelay)
	}

	// The instance's one retry timer: a burst of failures must schedule a single re-init, not one each.
	// Past this point the reconnect is committed — the poll loops are down and nothing but reInitAll()
	// brings them back, so no late arrival may cancel it (see markReachable()).
	scheduleReInit(reason) {
		this.reconnecting = true
		this.poll = false
		this.pollImage = false // an unreachable camera must not keep being asked for JPEGs
		this.setStatus(InstanceStatus.ConnectionFailure, reason)

		this.timeoutID = clearTimeout(this.timeoutID)
		this.timeoutID = setTimeout(() => {
			this.reconnecting = false
			this.reInitAll().catch((err) => this.log('error', 'Re-initialisation failed: ' + String(err)))
		}, this.config.timeout + this.config.pollDelay)
	}

	// Bring the connection up from nothing; starts by tearing down whatever the previous run left behind,
	// which is what lets init_tcp() assume no server is running and invalidates the prior poll loop.
	async reInitAll() {
		if (!this.config.host) return this.setStatus(InstanceStatus.BadConfig)

		await this.teardown()
		const generation = this.generation

		// The one place the series is resolved. Cleared first so the QID round-trip below — which
		// publishes variables on its way through — cannot read the previous camera's capabilities.
		this.SERIES = undefined

		this.imageErrors = 0
		this.failures = 0 // the streak belonged to the connection just torn down
		this.setStatus(InstanceStatus.Connecting, this.config.host + ':' + this.config.httpPort)

		await this.getCam('QID') // pull model
		if (!this.current(generation)) return // torn down while we waited

		this.SERIES = getAndUpdateSeries(this)

		this.getWeb('getinfo?FILE=1') // pull model, mac, version and serial
		this.getWeb('get_basic') // pull cam_title

		await getCameraStatusOnce(this)
		if (!this.current(generation)) return

		if (this.SERIES.capabilities.subscription) {
			this.getCameraStatus() // initial bulk retrieve (camdata.html)
			if (this.config.subscriptionEnable) {
				this.init_tcp()
			}
		}

		const caps = this.SERIES.capabilities
		const needsLoop = caps.poll || (caps.pull && !this.config.subscriptionEnable)

		if (needsLoop && this.config.pollAllow) {
			this.poll = true
			pollCameraStatus(this).catch((err) => this.log('error', 'Polling stopped: ' + String(err)))
		}

		this.init_variables()
		this.init_actions()
		this.init_feedbacks()
		this.init_presets()

		this.checkAllFeedbacks()
	}

	getConfigFields() {
		// Called each time the panel opens, so a static field can report a runtime-learned value.
		return ConfigFields.map((field) =>
			field.id === 'modelDetected' ? { ...field, value: describeDetectedModel(this.config, this.data) } : field,
		)
	}

	// ##########################
	// #### Instance Presets ####
	// ##########################
	init_presets() {
		const { structure, presets } = getPresetDefinitions(this)
		this.setPresetDefinitions(structure, presets)
	}

	// ############################
	// #### Instance Variables ####
	// ############################
	init_variables() {
		this.setVariableDefinitions(setVariables(this))
	}

	checkVariables() {
		checkVariables(this)
	}

	// ############################
	// #### Instance Feedbacks ####
	// ############################
	init_feedbacks() {
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
	}

	init_actions() {
		this.setActionDefinitions(getActionDefinitions(this))
	}
}
