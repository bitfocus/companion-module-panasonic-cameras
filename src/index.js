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

// Lead with the code: got carries it in `code` and does not always repeat it in the message. The
// String() fallback keeps a thrown non-Error from reading as "[object Object]".
export function describeError(err) {
	const message = err?.message || String(err)

	return err?.code ? `${err.code}: ${message}` : message
}

// First 40 bytes (28-byte header + start of command) for diagnosing desync without dumping a runaway buffer.
const hexdump = (buffer) => buffer.subarray(0, 40).toString('hex').replace(/(..)/g, '$1 ').trim()

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
	}

	// True while `generation` is still the running connection.
	current(generation) {
		return generation === this.generation
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

		if (config.debug) {
			this.log('debug', 'TCP unsubscription request: ' + url)
		}

		try {
			await this.httpGet(url, { timeout: { request: config.timeout } })

			this.log('info', 'un-subscribed: ' + url)
		} catch (err) {
			// Not handleConnectionError(): a failed goodbye to a dismantled connection looks like an absent
			// camera, and treating it as reconnectable would re-init an instance already being deleted.
			this.log('debug', 'TCP unsubscribe failed (the camera may already be gone): ' + String(err))
		}
	}

	async subscribeTCPEvents(port) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/event?connect=start&my_port=${port}&uid=0`

		if (this.config.debug) {
			this.log('debug', 'TCP subscription request: ' + url)
		}

		try {
			await this.httpGet(url)
			if (!this.current(generation)) return // old camera's hello must not mark the new one Ok

			this.log('info', 'subscribed: ' + url)

			this.updateStatus(InstanceStatus.Ok)

			await this.getPTZ('LPC1') // enable Lens Position Information updates
		} catch (err) {
			if (!this.current(generation)) return
			if (this.handleConnectionError(err)) this.log('error', 'Error on subscribe: ' + String(err))
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
							`Update notification stream out of sync, discarding buffer (${socket.name}): ${hexdump(raw)}`,
						)
						socket.buffer = Buffer.alloc(0)
					}

					for (const { command, source } of updates) {
						if (this.config.debug) {
							// `source` (sender address + clock) is logged only to help place a stray notification.
							this.log('info', `Received Update: ${command}  (${source})`)
						}

						parseUpdate(this, command.split(':'))
					}

					// Once for the whole batch: a coalesced burst is one redraw.
					if (updates.length) {
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
					this.updateStatus(InstanceStatus.UnknownError, 'TCP Port in use')

					this.unsubscribeTCPEvents(tcpPortSelected).catch(() => null)
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

				this.log('info', 'Listening for camera updates on localhost:' + tcpPortSelected)

				this.subscribeTCPEvents(tcpPortSelected)
			} catch (err) {
				this.log('error', "Couldn't bind to TCP port " + tcpPortSelected + ' on localhost: ' + String(err))
				this.updateStatus(InstanceStatus.UnknownError, 'TCP Port failure')
			}
		}

		return this
	}

	async getCameraStatus() {
		if (this.config.host) {
			const generation = this.generation
			const url = `http://${this.config.host}:${this.config.httpPort}/live/camdata.html`

			if (this.config.debug) {
				this.log('info', 'camdata request: ' + url)
			}

			try {
				const response = await this.httpGet(url)
				// The camera that answered may no longer be the one we are connected to.
				if (!this.current(generation)) return

				if (response.body) {
					const lines = response.body.trim().split('\r\n')

					for (let line of lines) {
						const str = line.replace(':0x', ':').trim()

						if (this.config.debug) {
							this.log('info', 'camdata response: ' + str)
						}

						parseUpdate(this, str.split(':'))
					}

					this.checkVariables()
					this.checkAllFeedbacks()

					this.updateStatus(InstanceStatus.Ok)
				}
			} catch (err) {
				// The old camera's failure must not schedule a reconnect for the current one.
				if (!this.current(generation)) return
				if (this.handleConnectionError(err)) this.log('error', 'camdata request  ' + url + ' failed: ' + String(err))
			}
		}
	}

	async getPTZ(cmd) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_ptz?cmd=%23${cmd}&res=1`
		if (this.config.debug) {
			this.log('info', 'PTZ request: ' + url)
		}

		try {
			const response = await this.httpGet(url)
			if (!this.current(generation)) return

			if (response.body) {
				const str = response.body.trim()

				if (this.config.debug) {
					this.log('info', 'PTZ response: ' + str)
				}

				parseUpdate(this, str.split(':'))

				this.checkVariables()
				this.checkAllFeedbacks()

				this.updateStatus(InstanceStatus.Ok)
			}
		} catch (err) {
			if (!this.current(generation)) return
			if (this.handleConnectionError(err)) this.log('error', 'PTZ request ' + url + ' failed: ' + String(err))
		}
	}

	async getCam(cmd) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_cam?cmd=${cmd}&res=1`

		if (this.config.debug) {
			this.log('info', 'Cam request: ' + url)
		}

		try {
			const response = await this.httpGet(url)
			if (!this.current(generation)) return

			if (response.body) {
				const str = response.body.trim()

				if (this.config.debug) {
					this.log('info', 'Cam response: ' + str)
				}

				parseUpdate(this, str.split(':'))

				this.checkVariables()
				this.checkAllFeedbacks()

				this.updateStatus(InstanceStatus.Ok)
			}
		} catch (err) {
			if (!this.current(generation)) return
			if (this.handleConnectionError(err)) this.log('error', 'Cam request ' + url + ' failed: ' + String(err))
		}
	}

	// Only for web commands that don't require admin rights.
	async getWeb(cmd, username = '', password = '') {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/${cmd}`

		if (this.config.debug) {
			this.log('info', 'Web request: ' + url)
		}

		try {
			const response = await this.httpGet(url, { username, password })
			if (!this.current(generation)) return

			if (response.body) {
				const lines = response.body.trim().split('\r\n')

				for (let line of lines) {
					const str = line.trim()

					if (this.config.debug) {
						this.log('info', 'Web response [' + cmd + ']: ' + str)
					}

					parseWeb(this, str.split('='), cmd)
				}
			} else {
				if (this.config.debug) {
					this.log('info', 'Web response [' + cmd + ']: Response code ' + response.statusCode.toString())
				}

				parseWebCode(this, response.statusCode, cmd)
			}

			this.checkVariables()
			this.checkAllFeedbacks()

			this.updateStatus(InstanceStatus.Ok)
		} catch (err) {
			if (!this.current(generation)) return
			if (this.handleConnectionError(err)) this.log('error', 'Web request ' + url + ' failed: ' + String(err))
		}
	}

	async getThumbnail(id) {
		if (this.SERIES?.capabilities.presetThumbnails) {
			const generation = this.generation
			const n = id + 1
			const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/get_preset_thumbnail?preset_number=${n}`

			if (this.config.debug) {
				this.log('info', 'Thumbnail request: ' + url)
			}

			try {
				const response = await this.httpGet(url)

				// rawBody is a plain Uint8Array, which Jimp would mistake for a URL
				const img = await Jimp.read(Buffer.from(response.rawBody))
				const png64 = await fitImage(img, this.config.imageScaling).getBase64(JimpMime.png)

				// Re-checked after the slow decode: a config change may have landed while Jimp worked.
				if (!this.current(generation)) return

				this.data.presetThumbnails[id] = png64

				this.checkAllFeedbacks()

				this.updateStatus(InstanceStatus.Ok)
			} catch (err) {
				if (!this.current(generation)) return
				if (err.code !== 'ERR_ABORTED') this.log('error', 'Thumbnail request ' + url + ' failed: ' + String(err))
			}
		}
	}

	// One image per instance; needs no login, frame size set by the camera (aw_ptz #RZL).
	async getImage() {
		if (!this.SERIES?.capabilities.imageTransmission || !this.config.imageEnable) return

		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/view.cgi?action=snapshot`

		if (this.config.debug) {
			this.log('info', 'Image request: ' + url)
		}

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

		this.updateStatus(InstanceStatus.Disconnected, 'Config changed')

		// The OLD config: the camera being left behind must be told to stop pushing, at its own address.
		await this.teardown(this.config)

		// Nothing the old camera reported is true of the new one; wipe it or its readings would persist.
		this.data = initialData()
		this.config = updated

		// No delay needed: teardown() is a real barrier, so nothing is left to wait out.
		await this.reInitAll()
	}

	// Handle timeouts and hide HTTP errors. Returns whether the caller should log the error.
	handleConnectionError(err) {
		// Cancelled by teardown(), not a camera failure; got raises it as ERR_ABORTED.
		if (err.code === 'ERR_ABORTED') return false

		// Unreachable: keep re-initialising until it comes back.
		if (REACHABILITY_ERRORS.has(err.code)) {
			this.scheduleReInit(String(err.code))
			return true // print error
		}

		// Camera answered but rejected the request; not a connection problem.
		if (err.code === 'ERR_NON_2XX_3XX_RESPONSE') return this.config.debug // hide error

		// Undiagnosed fault: stop rather than retry-loop against it.
		this.updateStatus(InstanceStatus.UnknownError, describeError(err))
		return true // print error
	}

	// The instance's one retry timer: a burst of failures must schedule a single re-init, not one each.
	scheduleReInit(reason) {
		this.poll = false
		this.pollImage = false // an unreachable camera must not keep being asked for JPEGs
		this.updateStatus(InstanceStatus.ConnectionFailure, reason)

		this.timeoutID = clearTimeout(this.timeoutID)
		this.timeoutID = setTimeout(() => {
			this.reInitAll().catch((err) => this.log('error', 'Re-initialisation failed: ' + String(err)))
		}, this.config.timeout + this.config.pollDelay)
	}

	// Bring the connection up from nothing; starts by tearing down whatever the previous run left behind,
	// which is what lets init_tcp() assume no server is running and invalidates the prior poll loop.
	async reInitAll() {
		if (!this.config.host) return this.updateStatus(InstanceStatus.BadConfig)

		await this.teardown()
		const generation = this.generation

		this.imageErrors = 0
		this.updateStatus(InstanceStatus.Connecting, this.config.host + ':' + this.config.httpPort)

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

		if (this.SERIES.capabilities.poll && this.config.pollAllow) {
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
