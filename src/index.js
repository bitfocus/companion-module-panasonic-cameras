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

// How long a camera gets to acknowledge the goodbye before the connection is torn down regardless. A
// camera that is gone never answers, and a config change must not sit out the full request timeout
// waiting for one that is.
const UNSUBSCRIBE_GRACE = 1000

// Every way the world between here and the camera can be broken — and every one of them is temporary,
// so each is worth waiting out. A camera entered by hostname fails DNS rather than TCP when the
// network drops, which is why the last two belong here: without them the same camera would recover on
// its own when entered by IP, and stay dead until someone pressed Apply when entered by name.
//
// Anything not on this list is not a reachability problem, and is deliberately not retried.
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

// The one line the user reads beside the connection — and, for a fault we did not anticipate, the one
// they would put in a bug report. So it leads with the code, which is precisely what we failed to
// recognise and the only part that identifies the fault: got carries it in `code`, and does not always
// repeat it in the message. Falling back through message to String() keeps a thrown non-Error — a bug
// in our own parsing, say — from reading as "[object Object]".
export function describeError(err) {
	const message = err?.message || String(err)

	return err?.code ? `${err.code}: ${message}` : message
}

// Enough of a frame to see its shape — the 28-byte header and the start of the command — without
// putting a whole runaway buffer in the log. This is what makes an out-of-sync notification stream
// something that can be diagnosed rather than merely reported.
const hexdump = (buffer) => buffer.subarray(0, 40).toString('hex').replace(/(..)/g, '$1 ').trim()

export default class PanasonicCameraInstance extends InstanceBase {
	constructor(internal) {
		super(internal)

		// These have to exist before init() runs: destroy() can be handed an instance whose init()
		// never completed, and it still has to be able to tear down cleanly.

		// The identity of the connection currently being run. teardown() bumps it, and everything that
		// was started under the old one — an answer still in flight, a poll loop parked in a sleep, a
		// retry waiting on a timer — recognises itself as stale and discards its own effect. Without
		// this, an answer from the camera the user just navigated away from lands in the state of the
		// camera they navigated to.
		this.generation = 0

		// Signs every request this instance makes, so teardown() has one handle that cancels all of
		// them at once. A fresh controller per generation: an aborted one stays aborted.
		this.aborter = new AbortController()

		this.clients = []
		this.poll = false
		this.pollGen = 0
		this.pollImage = false
		this.pollImageGen = 0
	}

	// True while the connection this call was made under is still the one the instance is running.
	// Every continuation after an await asks this before it touches anything.
	current(generation) {
		return generation === this.generation
	}

	// Every request the module makes goes out through here. One place to sign them all with the
	// generation's abort signal means teardown() cannot miss one, and a call site added later cannot
	// forget to be cancellable.
	httpGet(url, options = {}) {
		return got.get(url, {
			timeout: { request: this.config.timeout },
			...options,
			signal: this.aborter.signal, // last, so it is never a per-call decision
		})
	}

	// Everything that can still reach the camera, undone in the order that makes each step final.
	//
	// Takes the config it should undo rather than reading this.config, because the caller may already
	// know it is about to replace it: the goodbye has to go to the camera that was told to say hello.
	async teardown(config = this.config) {
		// 1. Nothing new starts. Bumping the loop tokens is what stops a loop that is parked inside a
		//    sleep and cannot see a flag until it wakes — and would wake to find the flag set again.
		this.poll = false
		this.pollImage = false
		this.pollGen++
		this.pollImageGen++
		this.timeoutID = clearTimeout(this.timeoutID) // a retry owed to the old connection is not the new one's

		// 2. Everything already in flight now belongs to a connection that no longer exists: its answer
		//    is discarded on arrival (see current()), and the request itself is cancelled so it does not
		//    hold a socket to the old camera open while it dies.
		this.generation++
		this.aborter.abort()
		this.aborter = new AbortController() // the goodbye below needs a live one — this order matters

		// 3. Tell the old camera to stop pushing. Only if we ever asked it to; this.server is that proof.
		//    Awaited, but bounded: when the address has not changed — the user only toggled polling, say
		//    — the stop has to land before the next start, or it unsubscribes the connection we are
		//    about to make. When the camera is simply gone, the bound is what keeps that ordering
		//    guarantee from costing the user a stalled config panel.
		if (this.server) {
			const goodbye = this.unsubscribeTCPEvents(this.tcpPortSelected, config)
			await raceTimeout(goodbye, Math.min(config.timeout, UNSUBSCRIBE_GRACE))
		}

		// 4. close() only stops the server accepting *new* connections. The socket the camera already
		//    holds open survives it, and goes on pushing that camera's state into an instance now
		//    pointed at a different one. It has to be destroyed by hand.
		for (const socket of this.clients) socket.destroy()
		this.clients = []

		if (this.server) {
			this.server.close()
			delete this.server
		}
	}

	// When module gets deleted
	async destroy() {
		await this.teardown()
	}

	// Takes the config explicitly: this is the one request deliberately sent to the connection being
	// left behind, so it must not read this.config, which the caller may already have replaced.
	async unsubscribeTCPEvents(port, config = this.config) {
		const url = `http://${config.host}:${config.httpPort}/cgi-bin/event?connect=stop&my_port=${port}&uid=0`

		if (config.debug) {
			this.log('debug', 'TCP unsubscription request: ' + url)
		}

		try {
			await this.httpGet(url, { timeout: { request: config.timeout } })

			this.log('info', 'un-subscribed: ' + url)
		} catch (err) {
			// Deliberately not handleConnectionError(): this is a goodbye to a connection already being
			// dismantled, and a goodbye that fails is what an absent camera looks like — not a connection
			// worth reconnecting. Treating it as one is what made deleting a connection to an offline
			// camera schedule a re-initialisation of the instance Companion had just thrown away, which
			// then rebuilt the server, the subscription and the polling seconds after it was deleted.
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
			if (!this.current(generation)) return // the old camera's hello must not mark the new one Ok

			this.log('info', 'subscribed: ' + url)

			this.updateStatus(InstanceStatus.Ok)

			await this.getPTZ('LPC1') // enable Lens Position Information updates
		} catch (err) {
			if (!this.current(generation)) return
			if (this.handleConnectionError(err)) this.log('error', 'Error on subscribe: ' + String(err))
		}
	}

	// Only ever reached with no server running: reInitAll() tears the previous connection down before
	// it builds the next one, so the cleanup this used to do itself now belongs to teardown() — the one
	// place that knows which camera is being left behind, and can therefore say goodbye to the right one.
	init_tcp() {
		const generation = this.generation // a socket accepted for a connection that is gone is not ours

		var tcpPortSelected = this.tcpPortSelected || 31004

		if (this.config.host) {
			// Create a new TCP server.
			this.server = net.createServer((socket) => {
				socket.name = socket.remoteAddress + ':' + socket.remotePort
				socket.buffer = Buffer.alloc(0) // what has arrived but does not yet make a whole notification
				this.clients.push(socket)

				// 'close' is the one event that always fires — 'end' does not, on a socket we destroy
				// ourselves, which is exactly what teardown() does to every one of these.
				socket.on('close', () => {
					// indexOf can be -1 for a stale socket teardown() has already dropped from the list;
					// splice(-1, 1) would then remove an unrelated, current socket, so guard against it.
					const index = this.clients.indexOf(socket)
					if (index !== -1) this.clients.splice(index, 1)
				})

				socket.on('error', () => {
					this.log('error', 'Update notification channel errored/died: ' + socket.name)
				})

				// Receive data from the client.
				socket.on('data', (data) => {
					// A push that arrives for a connection that has been torn down comes from the old camera:
					// it must not be parsed into the new one's state, and the socket carrying it has no
					// business still being open.
					if (!this.current(generation)) return socket.destroy()

					// A chunk is not a message: the camera's notifications are cut out of the accumulated
					// bytes, so a burst that arrives coalesced yields every one of them, and one that arrives
					// split waits for its other half instead of being parsed in pieces (see framing.js).
					socket.buffer = Buffer.concat([socket.buffer, data])

					const raw = socket.buffer
					const { updates, rest, desync } = extractUpdates(raw)
					socket.buffer = rest

					// The bytes do not frame as the notifications this knows how to read. Keeping them would
					// only mean reading the next chunk against a stream we have already lost our place in.
					if (desync || socket.buffer.length > MAX_BUFFER) {
						this.log(
							'error',
							`Update notification stream out of sync, discarding buffer (${socket.name}): ${hexdump(raw)}`,
						)
						socket.buffer = Buffer.alloc(0)
					}

					for (const { command, source } of updates) {
						if (this.config.debug) {
							// `source` is what the frame's header says about the camera that sent it — its address
							// and its own clock. Nothing acts on it; it is here because a notification that turns
							// up where it should not is otherwise very hard to place.
							this.log('info', `Received Update: ${command}  (${source})`)
						}

						parseUpdate(this, command.split(':'))
					}

					// Once for the whole batch: a coalesced burst is one redraw, not one per notification.
					if (updates.length) {
						this.checkVariables()
						this.checkAllFeedbacks()
					}
				})
			})

			// common error handler
			this.server.on('error', (err) => {
				// Catch uncaught Exception "EADDRINUSE" error that occurs if the port is already in use
				if (err.code === 'EADDRINUSE') {
					this.log('error', 'TCP error: Please use another TCP port, ' + tcpPortSelected + ' is already in use')
					this.log('error', 'TCP error: The TCP port must be unique between instances')
					this.log('error', 'TCP error: Please change it and click apply in ALL camera instances')
					this.updateStatus(InstanceStatus.UnknownError, 'TCP Port in use')

					// Cancel the subscription of info from the camera
					this.unsubscribeTCPEvents(tcpPortSelected).catch(() => null)
				} else {
					this.log('error', 'TCP server error: ' + String(err))
				}
			})

			// Listens for a client to make a connection request.
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

				// Subscibe to updates from camera
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
				// The camera that answered may no longer be the camera this instance is connected to.
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
				// A failure of the old camera is not a failure of the one we are connected to now, and must
				// not be allowed to schedule a reconnect on its behalf.
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

	// Currently only for web commands that don't require admin rights
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

				// got returns rawBody as a plain Uint8Array, which Jimp would mistake for a URL
				const img = await Jimp.read(Buffer.from(response.rawBody))
				const png64 = await fitImage(img, this.config.imageScaling).getBase64(JimpMime.png)

				// Checked after the decode as well as the request: Jimp is slow enough that a config change
				// can land while it works, and this would otherwise paint the old camera's preset onto a
				// button belonging to the new one.
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

	// One image for the whole instance: every button showing it shows the same camera, so there is one
	// picture to fetch. The snapshot takes no parameters — the frame size is whatever the camera is
	// configured to deliver (aw_ptz #RZL), and it needs no login.
	async getImage() {
		if (!this.SERIES?.capabilities.imageTransmission || !this.config.imageEnable) return

		const generation = this.generation
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/view.cgi?action=snapshot`

		if (this.config.debug) {
			this.log('info', 'Image request: ' + url)
		}

		try {
			// A full frame legitimately takes longer than a control command, and the refresh interval is
			// the real budget for it — but never less than the timeout the user configured.
			const response = await this.httpGet(url, {
				timeout: { request: Math.max(this.config.timeout, this.config.imageInterval) },
			})

			// got returns rawBody as a plain Uint8Array, which Jimp would mistake for a URL
			const img = await Jimp.read(Buffer.from(response.rawBody))

			// Checked after the decode too: a frame of the old camera must not be painted onto a button
			// that now belongs to the new one, and imageErrors below is instance-wide state.
			if (!this.current(generation)) return

			this.data.image = await fitImage(img, this.config.imageScaling).getBase64(JimpMime.png)
			this.imageErrors = 0

			this.checkFeedbacks('liveImage') // push the new frame to the buttons showing it
		} catch (err) {
			if (!this.current(generation)) return

			// Deliberately not handleConnectionError(): a slow or rejected image is no evidence that the
			// control connection is gone, and tearing that down — re-initialising the whole instance —
			// over a dropped frame would be a far worse failure than a stale thumbnail. One line per
			// failed frame would also flood the log at a frame a second, so only the first of a streak
			// is logged.
			if (this.imageErrors++ === 0) this.log('error', 'Image request ' + url + ' failed: ' + String(err))

			// Stop presenting a frozen frame as if it were live once the failure is more than a blip.
			if (this.imageErrors === 3) {
				this.data.image = null
				this.checkFeedbacks('liveImage')
			}
		}
	}

	// Initalize module
	async init(config) {
		// Fields added after the user last saved are absent from their stored config, so they are
		// filled from the defaults the config panel declares. Everything downstream can then read
		// this.config without a fallback of its own.
		this.config = applyConfigDefaults(config)

		this.data = initialData()

		// The live image loop. init() runs before setFeedbackDefinitions(), so the registry the feedback
		// writes into exists before the first evaluation can reach it.
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

	// Update module after a config change
	async configUpdated(config) {
		const updated = applyConfigDefaults(config)

		this.updateStatus(InstanceStatus.Disconnected, 'Config changed')

		// The OLD config, not the new one: the camera being left behind has to be told to stop pushing,
		// and it is only reachable at the address it was reached at. Handing teardown the new config is
		// what used to send the goodbye to the camera the user had just switched TO, while the one they
		// switched away from kept its subscription and kept pushing its state into this instance.
		await this.teardown(this.config)

		// Nothing the old camera said is true of the new one. A tally, a lens position, a preset name —
		// each outlives the connection it came from unless it is wiped here, and a value the new model
		// never reports would keep the old camera's reading forever.
		this.data = initialData()
		this.config = updated

		// No waiting around: teardown() is a real barrier now — every request is cancelled and every
		// continuation that could still write anything has been invalidated — so there is nothing left to
		// wait out. The delay this replaces was a hand-rolled one that did not work anyway (a request that
		// fails at the timeout schedules its retry *after* it) and cost every config change two seconds.
		await this.reInitAll()
	}

	// Handle timeouts and hide HTTP errors. Returns whether the caller should log the error.
	//
	// The three outcomes are the three things the user can do about them. A camera that cannot be
	// reached is a ConnectionFailure and the module keeps trying, because that is a fault of the world
	// and the world tends to right itself. Anything we did not anticipate is an UnknownError and the
	// module stops, because retrying something we do not understand is how a bug becomes a request
	// storm. Disconnected is reserved for the one case the user caused deliberately — a config change.
	handleConnectionError(err) {
		// A request cancelled by teardown() is this module hanging up, not the camera failing to answer.
		// got raises it as an AbortError carrying this code; without this case it would fall through to
		// the bottom and report a perfectly healthy camera as broken.
		if (err.code === 'ERR_ABORTED') return false

		// The camera cannot be reached: keep re-initialising until it comes back, so its state and its
		// update subscription are restored the moment it does.
		if (REACHABILITY_ERRORS.has(err.code)) {
			this.scheduleReInit(String(err.code))
			return true // print error
		}

		// The camera answered, it just did not like the request. Not a connection problem at all.
		if (err.code === 'ERR_NON_2XX_3XX_RESPONSE') return this.config.debug // hide error

		// Not a fault we know how to wait out. Say so, and stop: a retry loop around something we have
		// not diagnosed would hammer the camera without ever getting anywhere.
		this.updateStatus(InstanceStatus.UnknownError, describeError(err))
		return true // print error
	}

	// The one retry timer the instance has. An unreachable camera fails one request per poll command, so
	// a burst of failures has to schedule a single re-initialisation rather than one each.
	scheduleReInit(reason) {
		this.poll = false
		this.pollImage = false // an unreachable camera must not keep being asked for JPEGs
		this.updateStatus(InstanceStatus.ConnectionFailure, reason)

		this.timeoutID = clearTimeout(this.timeoutID)
		this.timeoutID = setTimeout(() => {
			this.reInitAll().catch((err) => this.log('error', 'Re-initialisation failed: ' + String(err)))
		}, this.config.timeout + this.config.pollDelay)
	}

	// Bring the connection up from nothing. Every path that wants a working connection comes through
	// here, and every one of them starts by destroying whatever the previous one left behind — the
	// reconnect included, whose whole premise is that the old connection is dead.
	//
	// That teardown is what makes the rest safe: init_tcp() is only ever reached with no server running,
	// so turning subscription off (or moving to a model that has none) closes the old server as a matter
	// of course; and the generation it bumps invalidates the poll loop of the run before, so a camera
	// that never answers can no longer accumulate one more polling loop per retry.
	async reInitAll() {
		if (!this.config.host) return this.updateStatus(InstanceStatus.BadConfig)

		await this.teardown()
		const generation = this.generation

		this.imageErrors = 0
		this.updateStatus(InstanceStatus.Connecting, this.config.host + ':' + this.config.httpPort)

		await this.getCam('QID') // pull model
		if (!this.current(generation)) return // a teardown while we waited: this run is not the live one

		this.SERIES = getAndUpdateSeries(this)

		this.getWeb('getinfo?FILE=1') // pull model, mac, version and serial
		this.getWeb('get_basic') // pull cam_title

		await getCameraStatusOnce(this)
		if (!this.current(generation)) return

		if (this.SERIES.capabilities.subscription) {
			this.getCameraStatus() // initial bulk retrieve of "all" data (camdata.html)
			if (this.config.subscriptionEnable) {
				this.init_tcp() // setup tcp push updates
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

	// Return config fields for web config
	getConfigFields() {
		// Companion calls this every time the config panel is opened, which is what lets a static field
		// report something the module only learns at runtime.
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

	// Update Values
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
