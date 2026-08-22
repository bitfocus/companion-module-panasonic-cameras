import { InstanceBase, InstanceStatus } from '@companion-module/base'
import { upgradeScripts } from './upgrades.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getPresetDefinitions } from './presets.js'
import { setVariables, checkVariables } from './variables.js'
import { ConfigFields, applyConfigDefaults, describeAuth, describeDetectedModel } from './config.js'
import * as net from 'net'
import got from 'got'
import { Jimp, JimpMime } from 'jimp'
import EventEmitter from 'events'
import { getAndUpdateSeries, fitImage, raceTimeout } from './common.js'
import { initialData } from './data.js'
import { extractUpdates, MAX_BUFFER } from './framing.js'
import { parseRefusal, parseUpdate, parseWeb, parseWebCode } from './parser.js'
import { createAuthSession, requestWithAuth } from './auth.js'
import { pollCameraStatus, getCameraStatusOnce } from './polling.js'

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

// HTTP rejections that say the request will never work as sent, as opposed to "not on this model".
// Both are conditions an operator can fix, so both get a status of their own.
const AUTH_REJECTIONS = {
	401: InstanceStatus.AuthenticationFailure,
	403: InstanceStatus.InsufficientPermissions,
}

// Which auth findings answer for which HTTP code.
const AUTH_SPEAKS_FOR = {
	401: ['credentialsRequired', 'rejected', 'unsupported'],
	403: ['forbidden'],
}

// The auth findings past which the request that met them cannot succeed. Whether that verdict belongs
// to the connection or only to the one command it happened to be is decided in reportAuthEvent.
const AUTH_REFUSALS = Object.values(AUTH_SPEAKS_FOR).flat()

// Ordinary HTTP error codes that are not caused by a connection problem and therefore do not need to be logged as errors.
const ORDINARY_REJECTION_CODES = new Set([
	503, // Service Unavailable: Precondition not met (e.g. SRT control while RTMP is the selected protocol)
])

// A refusal the camera returns in the body of a 200 (see parseRefusal). Meanings are from the
// protocol spec's "Error return" chapter; the module reacts to each differently (see reportRefusal).
const REFUSAL_UNSUPPORTED = 1
const REFUSAL_BUSY = 2
const REFUSAL_RANGE = 3

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

		// Identity of the current connection; teardown() bumps it so stale in-flight work discards itself.
		this.generation = 0

		// One handle for teardown() to cancel every request at once; fresh controller per generation.
		this.aborter = new AbortController()

		this.clients = []
		this.poll = false
		this.pollGen = 0
		this.pollImage = false
		this.pollImageGen = 0

		// True from the moment a reconnect is committed until it starts, so nothing withdraws it.
		this.reconnecting = false

		// Last status handed to Companion, so setStatus() can drop a repeat (see there).
		this.reportedStatus = undefined

		this.secrets = {}
		this.auth = createAuthSession()
		this.reportedAuth = new Set()
	}

	setStatus(status, message = null) {
		const reported = JSON.stringify([status, message])
		if (reported === this.reportedStatus) return

		this.reportedStatus = reported
		this.updateStatus(status, message)
	}

	current(generation) {
		return generation === this.generation
	}

	parseSafely(line, parse) {
		try {
			parse()
		} catch (err) {
			this.log('error', `Failed to parse camera response "${line}": ${describeError(err)}`)
		}
	}

	traced(polled, message) {
		if (!polled || this.config.trace) this.log('debug', message)
	}

	reportRefusal({ code, command }) {
		switch (code) {
			case REFUSAL_BUSY:
				return this.log('warn', `Camera busy, "${command}" not executed`)

			case REFUSAL_UNSUPPORTED:
				return this.log('warn', `Camera does not support "${command}"`)

			case REFUSAL_RANGE:
				return this.log('error', `Camera rejected "${command}": value outside the acceptable range`)
		}
	}

	// All requests go through here so teardown()'s abort signal is never missed.
	httpGet(url, options = {}) {
		const { auth = this.auth, polled = false, ...gotOptions } = options
		const { pathname, search } = new URL(url)

		return requestWithAuth(
			(headers) =>
				got.get(url, {
					timeout: { request: this.config.timeout },
					...gotOptions,
					headers: { ...gotOptions.headers, ...headers },
					retry: { limit: 0 },
					signal: this.aborter.signal,
				}),
			{
				session: auth,
				uri: pathname + search,
				report: (event) => this.reportAuthEvent(event, url, polled),
			},
		)
	}

	reportAuthEvent({ type, scheme, realm, algorithm, offered }, url, polled = false) {
		const refused = AUTH_REFUSALS.includes(type)
		const connection = !refused || polled || !this.auth?.ok

		// Blocking is a verdict about the connection, not about the request that happened to trigger it.
		// A restart button refused at Admin level must not stop a connection whose every other request
		// the camera answers without a login.
		if (refused && connection && this.auth) {
			this.auth.blocked = true
			this.poll = false
			this.pollImage = false
		}

		if (!connection) {
			if (this.reportedAuth.has('command:' + type)) return
			this.reportedAuth.add('command:' + type)

			return this.log(
				'error',
				'The camera rejected the command because the login credentials are invalid ' +
					`or the user account does not have sufficient permissions: ${url}`,
			)
		}

		this.data.auth = {
			state:
				{ none: 'none', credentialsRequired: 'required', rejected: 'rejected', unsupported: 'unsupported' }[type] ??
				'authenticated',
			scheme: scheme ?? this.data.auth?.scheme ?? null,
			realm: realm ?? this.data.auth?.realm ?? null,
		}

		if (this.reportedAuth.has(type)) return
		this.reportedAuth.add(type)

		const forRealm = realm ? ` (realm "${realm}")` : ''

		switch (type) {
			// The camera answered without asking for auth.
			case 'none':
				return

			case 'credentialsRequired':
				this.setStatus(InstanceStatus.AuthenticationFailure, 'Login required')
				return this.log(
					'error',
					`The camera requires a login${forRealm}: ${url} answered HTTP 401. Enter its user name and ` +
						"password in this connection's settings. A camera only asks once its 'User auth.' has been " +
						'switched on in the web menu; any camera-control or administrator account will do.',
				)

			case 'forbidden':
				this.setStatus(InstanceStatus.InsufficientPermissions, 'Insufficient permissions')
				return this.log(
					'error',
					`The camera refused ${url} with HTTP 403${forRealm}: the login this connection uses does not ` +
						'have the rights for it. Restarting a camera needs an account with administrator rights; ' +
						'everything else needs one with camera-control rights.',
				)

			case 'rejected':
				this.setStatus(InstanceStatus.AuthenticationFailure, 'Login rejected')
				return this.log(
					'error',
					`The camera rejected the user name and password${forRealm}. Check them in this connection's settings.`,
				)

			case 'unsupported':
				this.setStatus(InstanceStatus.AuthenticationFailure, 'Unsupported login method')
				return this.log(
					'error',
					`The camera asked for ${offered ?? 'a login method'}, which this module cannot answer. Set its ` +
						"'Auth. method' to 'Digest' or 'Basic' in the camera's web menu.",
				)

			case 'stale':
				return this.log('debug', `Camera issued a fresh authentication nonce${forRealm}; re-authenticated.`)

			case 'authenticated':
				return this.log(
					'debug',
					offered
						? `Camera asked for ${scheme} authentication${forRealm}${algorithm ? `, algorithm ${algorithm}` : ''}; authenticated.`
						: `Camera answered HTTP 401 naming no method${forRealm}; authenticated with ${scheme}.`,
				)

			default:
				return this.log('debug', `Unhandled authentication event "${type}".`)
		}
	}

	async teardown(config = this.config, auth = this.auth) {
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
			const goodbye = this.unsubscribeTCPEvents(this.tcpPortSelected, config, auth)
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

	// Takes config and login explicitly: this goodbye targets the connection being left behind, not
	// this.config. Handing it the live session also means it reuses the nonce already established, so
	// it needs no handshake inside the grace window teardown() allows it.
	async unsubscribeTCPEvents(port, config = this.config, auth = this.auth) {
		const url = `http://${config.host}:${config.httpPort}/cgi-bin/event?connect=stop&my_port=${port}&uid=0`

		this.log('debug', 'TCP unsubscription request: ' + url)

		try {
			await this.httpGet(url, { timeout: { request: config.timeout }, auth })

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
						// A push is an answer too. A subscription-only camera may make no HTTP request for
						// minutes, so without this its connection would have nothing to report Ok from.
						this.onRequestSucceeded()

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

					// Nothing was ever subscribed on this port, so there is nothing to say goodbye to.
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

	async getPTZ(cmd, { polled = false } = {}) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_ptz?cmd=%23${cmd}&res=1`

		this.traced(polled, 'PTZ request: ' + url)

		try {
			const response = await this.httpGet(url, { polled })
			if (!this.current(generation)) return

			if (response.body) {
				const str = response.body.trim()

				this.traced(polled, 'PTZ response: ' + str)

				// A refusal is not an update; it answers 200 all the same.
				const refusal = parseRefusal(str)
				if (refusal) this.reportRefusal(refusal)
				else this.parseSafely(str, () => parseUpdate(this, str.split(':')))

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

	async getCam(cmd, { polled = false } = {}) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_cam?cmd=${cmd}&res=1`

		// aw_cam splits its commands by first letter: 'O' sets, 'Q' asks. A set is answered by handing
		// the value back, a query by the camera reporting its own state.
		// The reply alone looks identical either way ("OAW:3"), so nothing downstream can tell them apart;
		// only the command that provoked it can.
		const echo = cmd.startsWith('O')

		this.traced(polled, 'Cam request: ' + url)

		try {
			const response = await this.httpGet(url, { polled })
			if (!this.current(generation)) return

			if (response.body) {
				const str = response.body.trim()

				this.traced(polled, 'Cam response: ' + str)

				// A refusal is not an update; it answers 200 all the same.
				const refusal = parseRefusal(str)
				if (refusal) this.reportRefusal(refusal)
				else this.parseSafely(str, () => parseUpdate(this, str.split(':'), { echo }))

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

	async getWeb(cmd, { polled = false } = {}) {
		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/${cmd}`

		this.traced(polled, 'Web request: ' + url)

		try {
			const response = await this.httpGet(url, { polled })
			if (!this.current(generation)) return

			if (response.body) {
				const lines = response.body.trim().split('\r\n')

				for (let line of lines) {
					const str = line.trim()

					this.traced(polled, 'Web response [' + cmd + ']: ' + str)

					this.parseSafely(str, () => parseWeb(this, str.split('='), cmd))
				}
			} else {
				this.traced(polled, 'Web response [' + cmd + ']: Response code ' + response.statusCode.toString())

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

			this.log('debug', 'Thumbnail request: ' + url)

			try {
				const response = await this.httpGet(url)

				// rawBody is a plain Uint8Array, which Jimp would mistake for a URL
				const img = await Jimp.read(Buffer.from(response.rawBody))
				const png64 = await fitImage(img).getBase64(JimpMime.png)

				// Re-checked after the slow decode: a config change may have landed while Jimp worked.
				if (!this.current(generation)) return

				this.data.presetThumbnails[id] = png64

				this.checkAllFeedbacks()

				this.onRequestSucceeded()
			} catch (err) {
				if (!this.current(generation)) return
				if (AUTH_REJECTIONS[err.response?.statusCode])
					return this.logConnectionError(err, 'Thumbnail request ' + url + ' failed')
				if (err.code !== 'ERR_ABORTED') this.log('error', 'Thumbnail request ' + url + ' failed: ' + String(err))
			}
		}
	}

	async getImage() {
		const image = this.SERIES?.capabilities.imageTransmission
		if (!image || !this.config.imageEnable) return

		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/${image.cmd}`

		this.traced(true, 'Image request: ' + url)

		try {
			// A full frame is budgeted by the refresh interval, but never below the configured timeout.
			const response = await this.httpGet(url, {
				timeout: { request: Math.max(this.config.timeout, this.config.imageInterval) },
				polled: true,
			})

			// got returns rawBody as a plain Uint8Array, which Jimp would mistake for a URL
			const img = await Jimp.read(Buffer.from(response.rawBody))

			// Re-checked after the decode: old camera's frame must not paint the new one's buttons.
			if (!this.current(generation)) return

			this.data.image = await fitImage(img).getBase64(JimpMime.png)
			this.imageErrors = 0

			this.checkFeedbacks('liveImage')
		} catch (err) {
			if (!this.current(generation)) return
			if (AUTH_REJECTIONS[err.response?.statusCode])
				return this.logConnectionError(err, 'Image request ' + url + ' failed')

			// Not handleConnectionError(): a dropped frame is no evidence the control connection is gone.
			if (this.imageErrors++ === 0) this.log('error', 'Image request ' + url + ' failed: ' + String(err))

			// Drop the frozen frame once the failures have persisted, rather than showing a stale picture.
			if (this.imageErrors === 3) {
				this.data.image = null
				this.checkFeedbacks('liveImage')
			}
		}
	}

	// Initalize module
	async init(config, isFirstInit, secrets) {
		// Fill fields absent from stored config with panel defaults, so downstream needs no fallback.
		this.config = applyConfigDefaults(config)
		this.secrets = secrets ?? {}

		this.data = initialData()

		this.imageSubscribers = new Map() // feedback instance id -> when it last asked for the image
		this.imageErrors = 0

		this.ptSpeed = 25
		this.pSpeed = 25
		this.tSpeed = 25
		this.zSpeed = 25
		this.fSpeed = 25

		this.tcpPortSelected = 31004

		this.speedChangeEmitter = new EventEmitter()

		await this.reInitAll()
	}

	async configUpdated(config, secrets) {
		const updated = applyConfigDefaults(config)

		this.setStatus(InstanceStatus.Disconnected, 'Config changed')

		await this.teardown(this.config, this.auth)

		this.data = initialData()
		this.config = updated
		this.secrets = secrets ?? {}

		await this.reInitAll()
	}

	// Whether reInitAll should give up where it stands: the connection it belongs to is gone, or a
	// reconnect has already been booked for it.
	stopped(generation) {
		return !this.current(generation) || this.reconnecting
	}

	markReachable() {
		return !this.reconnecting && !this.auth?.blocked
	}

	onRequestSucceeded() {
		if (this.markReachable()) this.setStatus(InstanceStatus.Ok)
	}

	logConnectionError(err, message) {
		const level = this.handleConnectionError(err)
		if (level) this.log(level, message)
	}

	// Classifies a failed request, moves the connection status with it, and returns the level the
	// caller should log at — or null for nothing.
	handleConnectionError(err) {
		// Cancelled by teardown(), not a camera failure; got raises it as ERR_ABORTED.
		if (err.code === 'ERR_ABORTED') return 'debug'

		// Unreachable: keep re-initialising until it comes back.
		if (REACHABILITY_ERRORS.has(err.code)) {
			this.scheduleReInit(String(err.code))
			return 'error'
		}

		// Camera answered but rejected the request; not a connection problem.
		if (err.code === 'ERR_NON_2XX_3XX_RESPONSE') {
			const reachable = this.markReachable()

			const status = AUTH_REJECTIONS[err.response?.statusCode]
			if (status) {
				const spokenFor = (AUTH_SPEAKS_FOR[err.response?.statusCode] ?? []).some(
					(type) => this.reportedAuth?.has(type) || this.reportedAuth?.has('command:' + type),
				)

				if (spokenFor) return null

				this.setStatus(status, `HTTP ${err.response.statusCode}`)
				return 'error'
			}

			if (reachable) this.setStatus(InstanceStatus.Ok)

			return ORDINARY_REJECTION_CODES.has(err.response?.statusCode) ? 'debug' : 'error'
		}

		if (err?.code === undefined) {
			this.setStatus(InstanceStatus.UnknownError, 'Module error: ' + describeError(err))
			return 'error'
		}

		// Undiagnosed fault: stop rather than retry-loop against it.
		this.setStatus(InstanceStatus.UnknownError, describeError(err))
		return 'error'
	}

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

		// One session per connection: it caches the camera's challenge, so the handshake happens once
		// rather than per request. The latch resets with it, so a new connection may say its piece again.
		this.auth = createAuthSession({ username: this.config.username, password: this.secrets.password })
		this.reportedAuth = new Set()
		this.setStatus(InstanceStatus.Connecting, this.config.host + ':' + this.config.httpPort)

		await this.getCam('QID') // pull model

		if (this.stopped(generation)) return
		if (this.auth.blocked) return

		this.SERIES = getAndUpdateSeries(this)

		this.getWeb('getinfo?FILE=1') // pull model, mac, version and serial
		this.getWeb('get_basic') // pull cam_title

		await getCameraStatusOnce(this)
		if (this.stopped(generation)) return

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
		const runtime = {
			modelDetected: () => describeDetectedModel(this.config, this.data),
			authDetected: () => describeAuth(this.data),
		}

		return ConfigFields.map((field) => (runtime[field.id] ? { ...field, value: runtime[field.id]() } : field))
	}

	init_presets() {
		const { structure, presets } = getPresetDefinitions(this)
		this.setPresetDefinitions(structure, presets)
	}

	init_variables() {
		this.setVariableDefinitions(setVariables(this))
	}

	checkVariables() {
		checkVariables(this)
	}

	init_feedbacks() {
		this.setFeedbackDefinitions(getFeedbackDefinitions(this))
	}

	init_actions() {
		this.setActionDefinitions(getActionDefinitions(this))
	}
}
