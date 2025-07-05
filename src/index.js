import { runEntrypoint, InstanceBase, InstanceStatus } from '@companion-module/base'
import { upgradeScripts } from './upgrades.js'
import { getActionDefinitions } from './actions.js'
import { getFeedbackDefinitions } from './feedbacks.js'
import { getPresetDefinitions } from './presets.js'
import { setVariables, checkVariables } from './variables.js'
import { ConfigFields } from './config.js'
import * as net from 'net'
import JimpRaw from 'jimp'
import EventEmitter from 'events'
import { getAndUpdateSeries } from './common.js'
import { parseUpdate, parseWeb, parseWebCode } from './parser.js'
import { pollCameraStatus } from './polling.js'

// Webpack makes a mess..
const Jimp = JimpRaw.default || JimpRaw

// ########################
// #### Instance setup ####
// ########################
class PanasonicCameraInstance extends InstanceBase {
	constructor(internal) {
		super(internal)
		this.abortController = new AbortController()
	}

	// When module gets deleted
	async destroy() {
		// Clear polling interval
		if (this.pollIntervalId) {
			clearInterval(this.pollIntervalId)
			this.pollIntervalId = null
		}

		// Clear any timeouts
		if (this.timeoutID) {
			clearTimeout(this.timeoutID)
			this.timeoutID = null
		}

		// Abort all pending HTTP requests
		if (this.abortController) {
			this.abortController.abort()
		}

		// Remove TCP Server and close all connections
		if (this.server) {
			// Stop getting Status Updates
			try {
				await this.unsubscribeTCPEvents(this.tcpServerPort)
			} catch (err) {
				// Ignore errors during cleanup
			}

			// Close and delete server
			this.server.close()
			delete this.server
		}
	}

	async unsubscribeTCPEvents(port) {
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/event?connect=stop&my_port=${port}&uid=0`

		if (this.config.debug) {
			this.log('debug', 'TCP unsubscription request: ' + url)
		}

		try {
			await this.httpRequest(url, { timeout: this.config.timeout })

			this.log('info', 'un-subscribed: ' + url)
		} catch (err) {
			if (this.handleConnectionError(err)) this.log('error', 'Error on TCP unsubscribe: ' + String(err))
		}
	}

	async subscribeTCPEvents(port) {
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/event?connect=start&my_port=${port}&uid=0`

		if (this.config.debug) {
			this.log('debug', 'TCP subscription request: ' + url)
		}

		try {
			await this.httpRequest(url, { timeout: this.config.timeout })

			this.log('info', 'subscribed: ' + url)

			this.updateStatus(InstanceStatus.Ok)

			await this.getPTZ('LPC1') // enable optional Lens Position Information updates
		} catch (err) {
			if (this.handleConnectionError(err)) this.log('error', 'Error on subscribe: ' + String(err))
			this.updateStatus(InstanceStatus.UnknownWarning, 'TCP subscription failed')
		}
	}

	init_subscription(port = 0) {
		// Create a new TCP server.
		this.server = net.createServer((socket) => {
			socket.name = socket.remoteAddress + ':' + socket.remotePort

			socket.on('end', () => {
				this.log('error', 'Update notification channel was closed from camera side: ' + socket.name)
				this.updateStatus(InstanceStatus.UnknownWarning, 'TCP subscription failed')
			})

			socket.on('error', () => {
				this.log('error', 'Update notification channel errored/died: ' + socket.name)
				this.updateStatus(InstanceStatus.UnknownWarning, 'TCP subscription failed')
			})

			// Receive data from the client (camera)
			socket.on('data', (data) => {
				// TODO - TCP doesn't guarantee messages will be chunked sensibly. When it doesnt, this logic will break

				// Data layout in buffer: [22 Bytes][2 Bytes][4 Bytes][CR][LF]>>>DATA<<<[CR][LF]*optional Bytes*[24 Bytes]
				// Convert binary buffer to string, split data in order to remove binary data before and after command
				const str = data.toString().split('\r\n', 3)[1]

				if (this.config.debug) {
					this.log('info', 'Received Update: ' + str)
				}

				parseUpdate(this, str.split(':'))

				// Update Variables and Feedbacks
				this.checkVariables()
				this.checkFeedbacks()
			})
		})

		// Handle successful server startup
		this.server.on('listening', () => {
			this.tcpServerPort = this.server.address().port
			this.log('info', 'Listening for camera updates on localhost:' + this.tcpServerPort)

			// Automatically subscribe to camera events once server is listening
			this.subscribeTCPEvents(this.tcpServerPort)
		})

		// common error handler
		this.server.on('error', (err) => {
			// Catch uncaught Exception"EADDRINUSE" error that occurs if the port is already in use
			if (err.code === 'EADDRINUSE') {
				this.log('error', 'TCP error: Please use another TCP port, ' + this.tcpServerPort + ' is already in use')
				this.log('error', 'TCP error: The TCP port must be unique between instances')
				this.log('error', 'TCP error: Please change it and click apply in ALL camera instances')
				this.updateStatus(InstanceStatus.UnknownError, 'TCP Port in use')

				// Cancel the subscription of info from the camera
				this.unsubscribeTCPEvents(this.tcpServerPort).catch(() => null)
			} else {
				this.log('error', 'TCP server error: ' + String(err))
			}
		})

		// Listens for a client (camera) to make a connection request.
		try {
			this.log('debug', 'Trying to listen to TCP from camera')
			this.server.listen(port)
		} catch (err) {
			this.log('error', "Couldn't bind to TCP port " + port + ' on localhost: ' + String(err))
			this.updateStatus(InstanceStatus.UnknownError, 'TCP Port failure')
		}
	}

	async getCameraStatus() {
		if (this.config.host) {
			const url = `http://${this.config.host}:${this.config.httpPort}/live/camdata.html`

			if (this.config.debug) {
				this.log('info', 'camdata request: ' + url)
			}

			try {
				const response = await this.httpRequest(url, { timeout: this.config.timeout })
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
					this.checkFeedbacks()

					this.updateStatus(InstanceStatus.Ok)
				}
			} catch (err) {
				if (this.handleConnectionError(err)) this.log('error', 'camdata request  ' + url + ' failed: ' + String(err))
			}
		}
	}

	async getPTZ(cmd) {
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_ptz?cmd=%23${cmd}&res=1`
		if (this.config.debug) {
			this.log('info', 'PTZ request: ' + url)
		}

		try {
			const response = await this.httpRequest(url, { timeout: this.config.timeout })
			if (response.body) {
				const str = response.body.trim()

				if (this.config.debug) {
					this.log('info', 'PTZ response: ' + str)
				}

				parseUpdate(this, str.split(':'))

				this.checkVariables()
				this.checkFeedbacks()

				this.updateStatus(InstanceStatus.Ok)
			}
		} catch (err) {
			if (this.handleConnectionError(err)) this.log('error', 'PTZ request ' + url + ' failed: ' + String(err))
		}
	}

	async getCam(cmd) {
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/aw_cam?cmd=${cmd}&res=1`

		if (this.config.debug) {
			this.log('info', 'Cam request: ' + url)
		}

		try {
			const response = await this.httpRequest(url, { timeout: this.config.timeout })
			if (response.body) {
				const str = response.body.trim()

				if (this.config.debug) {
					this.log('info', 'Cam response: ' + str)
				}

				parseUpdate(this, str.split(':'))

				this.checkVariables()
				this.checkFeedbacks()

				this.updateStatus(InstanceStatus.Ok)
			}
		} catch (err) {
			if (this.handleConnectionError(err)) this.log('error', 'Cam request ' + url + ' failed: ' + String(err))
		}
	}

	// Currently only for web commands that don't require admin rights
	async getWeb(cmd, username = '', password = '') {
		const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/${cmd}`

		if (this.config.debug) {
			this.log('info', 'Web request: ' + url)
		}

		try {
			const response = await this.httpRequest(url, { username, password, timeout: this.config.timeout })
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
			this.checkFeedbacks()

			this.updateStatus(InstanceStatus.Ok)
		} catch (err) {
			if (this.handleConnectionError(err)) this.log('error', 'Web request ' + url + ' failed: ' + String(err))
		}
	}

	async getThumbnail(id) {
		if (this.SERIES.capabilities.presetThumbnails) {
			const n = id + 1
			const url = `http://${this.config.host}:${this.config.httpPort}/cgi-bin/get_preset_thumbnail?preset_number=${n}`

			if (this.config.debug) {
				this.log('info', 'Thumbnail request: ' + url)
			}

			try {
				const response = await this.httpRequest(url, { timeout: this.config.timeout })

				const img = await Jimp.read(response.rawBody)
				const png64 = await img.scaleToFit(288, 288).getBase64Async('image/png')

				this.data.presetThumbnails[id] = png64

				this.checkFeedbacks()

				this.updateStatus(InstanceStatus.Ok)
			} catch (err) {
				this.log('error', 'Thumbnail request ' + url + ' failed: ' + String(err))
			}
		}
	}

	// Initalize module
	async init(config) {
		this.config = config

		// Initialize/reinitialize AbortController for new connection
		this.abortController = new AbortController()

		this.data = {
			debug: false,

			modelAuto: null,
			model: 'Auto',
			series: null,

			mac: null,
			serial: null,
			title: null,
			version: null,

			// unresolved enums
			autotrackingAngle: null,
			autotrackingEnabled: null,
			autotrackingMode: null,
			autotrackingStatus: null,
			colorbar: null,
			colorTemperature: null,
			error: null,
			filter: null,
			focusMode: null,
			gain: null,
			installMode: null,
			irisMode: null,
			nightMode: null,
			ois: null,
			power: null,
			presetScope: null,
			presetSpeed: null,
			presetSpeedTable: null,
			presetSpeedUnit: '0',
			recording: null,
			rtmp: null,
			sdInserted: null,
			sd2Inserted: null,
			shutter: null,
			srt: null,
			tally: null,
			tally2: null,
			tally3: null,
			ts: null,
			whiteBalance: null,

			// numeric index
			presetSelectedIdx: null,
			presetCompletedIdx: null,

			// numeric unsigned values
			focusPosition: null,
			irisPosition: null,
			irisVolume: null,
			panPosition: null,
			tiltPosition: null,
			zoomPosition: null,

			// numeric signed values
			focusSpeedValue: 0,
			redGainValue: 0,
			blueGainValue: 0,
			redPedValue: 0,
			bluePedValue: 0,
			//greenPedValue: 0,
			masterPedValue: 0,
			zoomSpeedValue: 0,

			// other strings
			colorTempLabel: null,
			irisLabel: null,
			shutterStepLabel: null,

			// arrays
			presetEntries0: Array(40),
			presetEntries1: Array(40),
			presetEntries2: Array(20),
			presetEntries: Array(100),
			presetThumbnails: Array(100),
		}

		this.ptSpeed = 25
		this.pSpeed = 25
		this.tSpeed = 25
		this.zSpeed = 25
		this.fSpeed = 25

		// default server port for TCP subscription updates
		this.tcpServerPort = 31004

		// Set default config values
		this.config.host = this.config.host ?? ''
		this.config.httpPort = this.config.httpPort ?? 80
		this.config.timeout = this.config.timeout ?? 1000
		this.config.pollAllow = this.config.pollAllow ?? false
		this.config.pollDelay = this.config.pollDelay ?? 100
		this.config.tcpPort = this.config.tcpPort ?? 31004
		this.config.autoTCP = this.config.autoTCP ?? true
		this.config.model = this.config.model ?? 'Auto'
		this.config.debug = this.config.debug ?? false

		this.speedChangeEmitter = new EventEmitter()

		// Start initialization if we have a valid host
		if (this.config.host.length > 0) {
			this.updateStatus(InstanceStatus.Connecting, this.config.host + ':' + this.config.httpPort)

			await this.getCam('QID') // pull model

			this.SERIES = getAndUpdateSeries(this)

			this.getWeb('getinfo?FILE=1') // pull model, mac, version and serial
			this.getWeb('get_basic') // pull cam_title
			if (this.SERIES.capabilities.subscription && this.config.subscriptionEnable) {
				this.getCameraStatus() // initial bulk retrieve of "all" data (camdata.html)
				this.init_subscription(this.config.portManual ? this.config.tcpPort : 0) // setup tcp push updates
			}

			if (this.SERIES.capabilities.poll && this.config.pollAllow) {
				pollCameraStatus(this) // start async polling
			}
			this.init_actions()
			this.init_presets()
			this.init_variables()
			this.init_feedbacks()

			this.subscribeFeedbacks()
		} else {
			this.updateStatus(InstanceStatus.BadConfig)
		}
	}

	// Update module after a config change
	async configUpdated(config) {
		this.updateStatus(InstanceStatus.Disconnected, 'Config changed')

		// Clean up existing connections and resources
		await this.destroy()

		// Reinitialize with new config
		await this.init(config)
	}

	// Handle timeout and hide HTTP errors
	handleConnectionError(err) {
		switch (err.code) {
			case 'ETIMEDOUT':
				this.updateStatus(InstanceStatus.Disconnected, 'Timeout')

				this.timeoutID = clearTimeout(this.timeoutID)
				this.timeoutID = setTimeout(async () => {
					await this.destroy()
					await this.init(this.config)
				}, this.config.timeout + this.config.pollDelay)
				break
			case 'ERR_NON_2XX_3XX_RESPONSE':
				return this.config.debug // hide error
		}

		this.updateStatus(InstanceStatus.ConnectionFailure, String(err))
		return true // print error
	}

	// Return config fields for web config
	getConfigFields() {
		return ConfigFields
	}

	// ##########################
	// #### Instance Presets ####
	// ##########################
	init_presets() {
		this.setPresetDefinitions(getPresetDefinitions(this))
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

	// Helper method for making HTTP requests with fetch
	async httpRequest(url, options = {}) {
		const { username, password, timeout = this.config.timeout } = options

		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeout)

		try {
			const fetchOptions = {
				signal: this.abortController.signal,
				...options,
			}

			// Handle basic authentication
			if (username && password) {
				const credentials = Buffer.from(`${username}:${password}`).toString('base64')
				fetchOptions.headers = {
					...fetchOptions.headers,
					Authorization: `Basic ${credentials}`,
				}
			}

			// Create a combined signal that aborts if either the instance abortController or timeout occurs
			const combinedController = new AbortController()

			const abortHandler = () => combinedController.abort()
			this.abortController.signal.addEventListener('abort', abortHandler)
			controller.signal.addEventListener('abort', abortHandler)

			fetchOptions.signal = combinedController.signal

			const response = await fetch(url, fetchOptions)

			clearTimeout(timeoutId)
			this.abortController.signal.removeEventListener('abort', abortHandler)
			controller.signal.removeEventListener('abort', abortHandler)

			// Check if response is ok first
			if (!response.ok) {
				const httpError = new Error(`HTTP ${response.status}`)
				httpError.code = 'ERR_NON_2XX_3XX_RESPONSE'
				throw httpError
			}

			// Get the response as arrayBuffer first, then convert for both body formats
			const rawBody = await response.arrayBuffer()
			const body = new TextDecoder().decode(rawBody)

			return {
				body,
				rawBody: new Uint8Array(rawBody),
				statusCode: response.status,
			}
		} catch (error) {
			clearTimeout(timeoutId)

			if (error.name === 'AbortError') {
				const timeoutError = new Error('Request timeout')
				timeoutError.code = 'ETIMEDOUT'
				throw timeoutError
			}

			throw error
		}
	}
}

runEntrypoint(PanasonicCameraInstance, upgradeScripts)
