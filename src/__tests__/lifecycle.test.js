import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as net from 'net'
import PanasonicCameraInstance, { REACHABILITY_ERRORS, describeError } from '../index.js'
import { pollCameraStatus } from '../polling.js'
import { initialData } from '../data.js'

// init_tcp() is the one path that reaches a real socket, so the listener is stubbed. `emitError`
// stands in for the async 'error' the OS raises after listen() on a taken port.
vi.mock('net', () => {
	const createServer = vi.fn(() => {
		const handlers = {}
		return {
			on: vi.fn((event, fn) => (handlers[event] = fn)),
			listen: vi.fn(),
			close: vi.fn(),
			address: () => ({ port: 31004 }),
			emitError: (err) => handlers.error?.(err),
		}
	})
	return { createServer, default: { createServer } }
})

// Changing config used to leave the old camera running alongside the new one: it was never
// unsubscribed (the goodbye went to the new config's host), its open socket survived server.close(),
// and in-flight requests landed afterwards into the new camera's state. This pins the teardown that
// fixes it, plus two failures from the same root: a deleted connection resurrecting, and poll loops multiplying.

// Real prototype methods on a hand-built instance: InstanceBase's constructor cannot run outside
// Companion, but every method under test is on the prototype and reads only fields we supply.
function makeInstance(config = {}, { series = 'UE80', capabilities } = {}) {
	const self = Object.create(PanasonicCameraInstance.prototype)

	self.config = {
		host: '10.0.0.1',
		httpPort: 80,
		timeout: 2000,
		pollDelay: 100,
		pollAllow: true,
		subscriptionEnable: true,
		imageEnable: false,
		imageInterval: 1000,
		trace: false,
		model: 'Auto',
		...config,
	}

	self.data = initialData()
	self.SERIES = { id: series, capabilities: { subscription: true, poll: false, pull: false, ...capabilities } }

	self.generation = 0
	self.aborter = new AbortController()
	self.clients = []
	self.poll = false
	self.pollGen = 0
	self.pollImage = false
	self.pollImageGen = 0
	self.imageErrors = 0
	self.failures = 0
	self.reconnecting = false
	self.imageSubscribers = new Map()
	self.tcpPortSelected = 31004

	self.log = vi.fn()
	self.updateStatus = vi.fn()
	self.checkVariables = vi.fn()
	self.checkAllFeedbacks = vi.fn()
	self.checkFeedbacks = vi.fn()
	self.setVariableDefinitions = vi.fn()
	self.setActionDefinitions = vi.fn()
	self.setFeedbackDefinitions = vi.fn()
	self.setPresetDefinitions = vi.fn()

	// Every request goes through httpGet, so stubbing it stubs the whole HTTP surface.
	self.requests = []
	self.httpGet = vi.fn(async (url) => {
		self.requests.push(url)
		return { body: '', statusCode: 200 }
	})

	return self
}

function fakeSocket() {
	return { destroy: vi.fn(), on: vi.fn(), remoteAddress: '10.0.0.1', remotePort: 50000 }
}

function fakeServer() {
	return { close: vi.fn(), on: vi.fn(), listen: vi.fn(), address: () => ({ port: 31004 }) }
}

const stops = (self) => self.requests.filter((u) => u.includes('connect=stop'))

describe('describeError', () => {
	it('leads with the code, which is the part that identifies the fault', () => {
		const err = Object.assign(new Error('connect ECONNREFUSED 10.0.0.1:80'), { code: 'ECONNREFUSED' })

		expect(describeError(err)).toBe('ECONNREFUSED: connect ECONNREFUSED 10.0.0.1:80')
	})

	it('still says something useful for an error that carries no code', () => {
		// A bug in our own parsing arrives as a plain TypeError.
		expect(describeError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(
			"Cannot read properties of undefined (reading 'x')",
		)
	})

	it('does not degrade to "[object Object]" for something thrown that is not an Error', () => {
		expect(describeError({ code: 'WEIRD' })).toBe('WEIRD: [object Object]')
		expect(describeError('just a string')).toBe('just a string')
	})
})

describe('teardown', () => {
	it('says goodbye to the camera it is leaving, not the one it is going to', async () => {
		// The headline bug: unsubscribeTCPEvents built its URL from this.config, already replaced by
		// configUpdated, so the stop went to the new camera and the old one kept its subscription.
		const self = makeInstance({ host: '10.0.0.1' })
		self.server = fakeServer()

		await self.teardown(self.config)

		expect(stops(self)).toHaveLength(1)
		expect(stops(self)[0]).toContain('10.0.0.1')
		expect(stops(self)[0]).toContain('my_port=31004')
	})

	it('destroys every socket the camera still holds open, then closes the server', async () => {
		// server.close() only stops accepting new connections; an open socket keeps delivering until destroyed.
		const self = makeInstance()
		const server = fakeServer()
		const [a, b] = [fakeSocket(), fakeSocket()]

		self.server = server
		self.clients = [a, b]

		await self.teardown()

		expect(a.destroy).toHaveBeenCalled()
		expect(b.destroy).toHaveBeenCalled()
		expect(self.clients).toEqual([])
		expect(server.close).toHaveBeenCalled()
		expect(self.server).toBeUndefined()
	})

	it('does not greet a camera it never subscribed to', async () => {
		const self = makeInstance() // no server: never subscribed

		await self.teardown()

		expect(stops(self)).toHaveLength(0)
	})

	it('cancels the requests already in flight', async () => {
		const self = makeInstance()
		const signal = self.aborter.signal

		await self.teardown()

		expect(signal.aborted).toBe(true)
		expect(self.aborter.signal.aborted).toBe(false) // the next connection gets a live one
	})

	it('invalidates everything the previous connection had running', async () => {
		const self = makeInstance()
		self.poll = true
		self.pollImage = true

		const before = self.generation
		await self.teardown()

		expect(self.generation).toBe(before + 1)
		expect(self.poll).toBe(false)
		expect(self.pollImage).toBe(false)
	})
})

describe('an answer that arrives after the connection has moved on', () => {
	it('is not parsed into the new camera state', async () => {
		const self = makeInstance()

		// The old camera answers slowly, after the config has already changed.
		let release
		self.httpGet = vi.fn(() => new Promise((resolve) => (release = () => resolve({ body: 'OTD:1\r\n' }))))

		const inFlight = self.getCam('QID')
		await self.teardown() // the user hits Apply while the request is still open
		release()
		await inFlight

		expect(self.data.model).toBe('Auto') // untouched
		expect(self.updateStatus).not.toHaveBeenCalledWith(expect.stringContaining('ok'), expect.anything())
	})

	it('does not schedule a reconnect when it fails', async () => {
		vi.useFakeTimers()
		const self = makeInstance()

		let reject
		self.httpGet = vi.fn(() => new Promise((_, r) => (reject = r)))

		const inFlight = self.getCam('QID')
		await self.teardown()
		reject(Object.assign(new Error('gone'), { code: 'ETIMEDOUT' }))
		await inFlight

		// A failure of the camera we left is not a reason to reconnect to the one we are on.
		expect(vi.getTimerCount()).toBe(0)
		vi.useRealTimers()
	})
})

// The reported status promises what the module does next: ConnectionFailure keeps trying,
// UnknownError does not, Disconnected is user-initiated. Each is pinned against the codes that produce it.
describe('handleConnectionError', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	// Driven off the module's own list, so a code added there without a reconnect behind it is caught.
	it.each([...REACHABILITY_ERRORS])('reports %s as a connection failure, and keeps trying', (code) => {
		const self = makeInstance()

		// One of these is a blip; a streak of them is a lost camera (see FAILURE_THRESHOLD).
		self.handleConnectionError({ code })
		self.handleConnectionError({ code })
		expect(self.handleConnectionError({ code })).toBe('error')

		// Amber while the streak is still sub-threshold, red once it is not.
		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_warning', 'connection_failure'])
		expect(vi.getTimerCount()).toBe(1) // a reconnect is scheduled
	})

	it('treats a camera entered by hostname the same as one entered by IP', () => {
		// A DNS failure is as temporary as an unplugged cable, but got surfaces it as ENOTFOUND, not a
		// TCP code. Left off the list, a hostname camera stayed dead until Apply while an IP one recovered.
		expect(REACHABILITY_ERRORS.has('ENOTFOUND')).toBe(true)
		expect(REACHABILITY_ERRORS.has('EAI_AGAIN')).toBe(true)
	})

	it('gives up on a fault it does not recognise, rather than retrying blind', () => {
		const self = makeInstance()

		// Retrying an undiagnosed fault turns a bug into a request storm; the user is told and the module stops.
		expect(self.handleConnectionError({ code: 'ERR_BODY_PARSE_FAILURE' })).toBe('error')

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_error'])
		expect(vi.getTimerCount()).toBe(0)
	})

	it('names the code it did not recognise, since that is the whole reason it gave up', () => {
		const self = makeInstance()

		self.handleConnectionError(Object.assign(new Error('Unexpected token'), { code: 'ERR_BODY_PARSE_FAILURE' }))

		// The detail is what the user reads beside the connection; without the code it says only that
		// something went wrong, not what.
		const [, detail] = self.updateStatus.mock.calls[0]
		expect(detail).toBe('ERR_BODY_PARSE_FAILURE: Unexpected token')
	})

	it('does not mistake our own cancellation for a camera failure', () => {
		const self = makeInstance()

		// teardown() aborts in-flight requests; got surfaces that as ERR_ABORTED. Read as a camera
		// failure it would report a healthy camera as broken and schedule a pointless retry.
		expect(self.handleConnectionError({ code: 'ERR_ABORTED' })).toBe('debug')

		expect(self.updateStatus).not.toHaveBeenCalled()
		expect(vi.getTimerCount()).toBe(0)
	})

	it('lets a burst of failures share one reconnect', () => {
		const self = makeInstance()

		// A dead camera fails one request per poll command; a retry each would stampede it on recovery.
		self.handleConnectionError({ code: 'ETIMEDOUT' })
		self.handleConnectionError({ code: 'ECONNREFUSED' })
		self.handleConnectionError({ code: 'EHOSTUNREACH' })

		expect(vi.getTimerCount()).toBe(1)
	})

	it('rides out a single dropped connection instead of rebuilding the whole instance', async () => {
		// A single ECONNRESET on a keep-alive is still reported — but read as a *lost* connection it
		// stopped polling, flipped the status and re-published ~200 presets: a full panel redraw for a
		// blip. Reporting it and reconnecting over it are two different decisions.
		const self = makeInstance()
		self.poll = true

		expect(self.handleConnectionError({ code: 'ECONNRESET' })).toBe('error')

		// Amber, not red: the failure is told, but nothing has been given up on yet.
		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_warning'])
		expect(self.poll).toBe(true) // polling is what recovers it
	})

	it('withdraws the pending retry as soon as a request gets through again', async () => {
		const self = makeInstance()
		self.reInitAll = vi.fn()
		self.httpGet = vi.fn(async () => ({ body: 'OID:AW-UE100\r\n', statusCode: 200 }))

		self.handleConnectionError({ code: 'ECONNRESET' })
		expect(vi.getTimerCount()).toBe(1) // armed in case nothing else drives a retry

		await self.getCam('QID') // the very next poll succeeds

		expect(vi.getTimerCount()).toBe(0)
		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_warning', 'ok'])

		// Nothing must resurrect the reconnect once the connection has proven itself.
		await vi.advanceTimersByTimeAsync(60_000)
		expect(self.reInitAll).not.toHaveBeenCalled()
	})

	// Companion writes a "Status: ok - null" line to the connection log for every set-status message,
	// deduplicating only the status it stores. A poll loop calls onRequestSucceeded() per command, so
	// without this the log was one status line per request and nothing else stayed visible in it.
	it('reports a status once and stays quiet while it holds', async () => {
		const self = makeInstance()
		self.httpGet = vi.fn(async () => ({ body: 'OID:AW-UE100\r\n', statusCode: 200 }))

		for (let i = 0; i < 20; i++) await self.getCam('QID')

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['ok'])
	})

	it('reports a status again once something else has been reported in between', async () => {
		const self = makeInstance()
		self.reInitAll = vi.fn()
		self.httpGet = vi.fn(async () => ({ body: 'OID:AW-UE100\r\n', statusCode: 200 }))

		await self.getCam('QID')
		self.scheduleReInit('ECONNRESET')
		self.reconnecting = false // the retry fired; the camera answers again
		await self.getCam('QID')

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['ok', 'connection_failure', 'ok'])
	})

	// The message is half the status: two failures for different reasons are two different reports.
	it('reports a repeated status whose detail changed', async () => {
		const self = makeInstance()
		self.reInitAll = vi.fn()

		self.scheduleReInit('ECONNREFUSED')
		self.scheduleReInit('EHOSTUNREACH')

		expect(self.updateStatus.mock.calls.map(([, detail]) => detail)).toEqual(['ECONNREFUSED', 'EHOSTUNREACH'])
	})

	it('still gives up on a camera that goes quiet without another request to notice', async () => {
		// A subscription-only camera makes no further requests, so the streak can never grow past one.
		// The fallback timer is what keeps that connection from sitting in Ok forever.
		const self = makeInstance()
		self.reInitAll = vi.fn()

		self.handleConnectionError({ code: 'EHOSTUNREACH' })
		await vi.advanceTimersByTimeAsync(self.config.timeout + self.config.pollDelay)

		// Amber the moment the first request failed, red once the fallback gave up on it.
		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_warning', 'connection_failure'])
	})

	it('does not let a late answer cancel a reconnect that is already committed', async () => {
		// scheduleReInit() has stopped the poll loops and only reInitAll() starts them again. A request
		// still in flight when the streak completed would otherwise clear the timer on its way in,
		// leaving the connection reporting Ok with its monitoring dead for good.
		const self = makeInstance()
		self.reInitAll = vi.fn(async () => {})
		self.poll = true

		for (let i = 0; i < 3; i++) self.handleConnectionError({ code: 'ETIMEDOUT' })
		expect(self.poll).toBe(false) // committed

		self.httpGet = vi.fn(async () => ({ body: 'OID:AW-UE100\r\n', statusCode: 200 }))
		await self.getCam('QID') // the in-flight request lands a moment too late

		// The late answer must not report Ok over the failure; the amber is from the sub-threshold streak.
		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_warning', 'connection_failure'])

		await vi.advanceTimersByTimeAsync(self.config.timeout + self.config.pollDelay)
		expect(self.reInitAll).toHaveBeenCalled() // the reconnect still runs, and restarts polling
	})

	it('takes a rejected request as proof the camera is there', async () => {
		// ERR_NON_2XX_3XX_RESPONSE means the camera answered, so it ends a streak rather than ignoring it.
		const self = makeInstance()

		self.handleConnectionError({ code: 'ECONNRESET' })
		expect(vi.getTimerCount()).toBe(1)

		self.handleConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE' })

		expect(self.failures).toBe(0)
		expect(vi.getTimerCount()).toBe(0)
	})

	// A rejected command used to be silent and statusless, so a camera refusing every request for want
	// of credentials looked identical to one answering them.
	it.each([
		[401, 'authentication_failure'],
		[403, 'insufficient_permissions'],
	])('names HTTP %i as something the operator can fix', (statusCode, status) => {
		const self = makeInstance()

		const level = self.handleConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE', response: { statusCode } })

		expect(level).toBe('error')
		expect(self.updateStatus.mock.calls).toEqual([[status, `HTTP ${statusCode}`]])
	})

	// Each of these is a way these cameras decline a command while working perfectly well: 400 for one
	// they carry no configuration for, 404 for a CGI this generation never had, 503 for one whose
	// precondition does not hold. None reaches the operator as a fault.
	it.each([400, 404, 503])('stays quiet about the ordinary rejection %i', (statusCode) => {
		const self = makeInstance()

		const level = self.handleConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE', response: { statusCode } })

		expect(level).toBe('debug')
	})

	// Declining a command is ordinary; failing to answer one is not. The quiet set is small and known,
	// the set of faults is open-ended, so anything outside the first is reported rather than assumed.
	it.each([429, 500, 502, 504])('does not extend that silence to the unexpected %i', (statusCode) => {
		const self = makeInstance()

		const level = self.handleConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE', response: { statusCode } })

		expect(level).toBe('error')
	})

	// markReachable() withdraws the fallback retry along with the streak. Without restoring the status
	// here, a connection left amber by a sub-threshold failure had nothing left to clear it — and with
	// polling off, nothing would ever ask again.
	it('takes an ordinary rejection as proof the camera came back', () => {
		const self = makeInstance()

		self.handleConnectionError({ code: 'ECONNRESET' }) // sub-threshold: amber
		self.handleConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE', response: { statusCode: 404 } })

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['unknown_warning', 'ok'])
		expect(vi.getTimerCount()).toBe(0) // and the retry it withdrew is not owed any more
	})

	// The camera answered, but with the one rejection an operator has to act on — reporting Ok over it
	// would erase the only sign of it.
	it('does not report Ok over an authentication failure', () => {
		const self = makeInstance()

		self.handleConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE', response: { statusCode: 401 } })

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['authentication_failure'])
	})

	// The level decides how loud a failure is; the caller only supplies the words.
	it('logs a failed request at the level its classification earned', async () => {
		const self = makeInstance()

		self.logConnectionError({ code: 'ERR_NON_2XX_3XX_RESPONSE', response: { statusCode: 404 } }, 'Cam request failed')
		self.logConnectionError({ code: 'ECONNRESET' }, 'PTZ request failed')

		expect(self.log.mock.calls).toEqual([
			['debug', 'Cam request failed'],
			['error', 'PTZ request failed'],
		])
	})

	it('keeps Disconnected for the one thing the user did on purpose', async () => {
		const self = makeInstance()
		self.reInitAll = vi.fn()

		await self.configUpdated({ ...self.config, host: '10.0.0.2' })

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['disconnected'])
	})
})

// A line the parser chokes on is a module bug. Inside the request's try it arrived at
// handleConnectionError as a TypeError with no `err.code`, which reported it as a camera fault and
// left the connection deadened with no retry — while poisoning every line behind it in the dump.
describe('a response line the parser cannot read', () => {
	const dump = ['p1', 'MALFORMED', 'OSD:B0:20'].join('\r\n')

	it('costs that one line, not the rest of the bulk dump', async () => {
		const self = makeInstance()
		self.httpGet = vi.fn(async () => ({ body: dump, statusCode: 200 }))

		// Stand in for a parser that throws on the middle line of a 400-line camdata dump.
		const seen = []
		self.parseSafely = vi.fn((line, parse) => {
			seen.push(line)
			if (line !== 'MALFORMED') parse()
		})

		await self.getCameraStatus()

		expect(seen).toEqual(['p1', 'MALFORMED', 'OSD:B0:20'])
		expect(self.data.power).toBe('1') // the line before it landed
	})

	it('is named as a module error if one ever does reach the connection handler', () => {
		const self = makeInstance()

		// got labels everything it raises, so an error with no `code` cannot have come from the camera.
		self.handleConnectionError(new TypeError("Cannot read properties of undefined (reading 'replace')"))

		const [status, detail] = self.updateStatus.mock.calls.at(-1)
		expect(status).toBe('unknown_error')
		expect(detail).toBe("Module error: Cannot read properties of undefined (reading 'replace')")
	})

	it('gets logged with the line that produced it', async () => {
		const self = makeInstance()
		self.httpGet = vi.fn(async () => ({ body: dump, statusCode: 200 }))

		self.parseSafely = (line, parse) =>
			PanasonicCameraInstance.prototype.parseSafely.call(self, line, () => {
				if (line === 'MALFORMED') throw new TypeError('nope')
				parse()
			})

		await self.getCameraStatus()

		const logged = self.log.mock.calls.map(([, message]) => message)
		expect(logged.some((m) => m.includes('Failed to parse camera response "MALFORMED"'))).toBe(true)
		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['ok']) // still a healthy camera
	})
})

describe('a TCP port that is already taken', () => {
	beforeEach(() => net.createServer.mockClear())

	function bindOnTakenPort() {
		const self = makeInstance()
		self.init_tcp()

		const server = net.createServer.mock.results[0].value
		server.emitError(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' }))
		return { self, server }
	}

	it('drops the server it could not bind, so nothing later mistakes it for a subscription', () => {
		const { self, server } = bindOnTakenPort()

		expect(server.close).toHaveBeenCalled()
		expect(self.server).toBeUndefined()
	})

	it('does not say goodbye for a subscription it never made', async () => {
		// The camera was never told about this port: `connect=start` only goes out once the listener is
		// up. Both the handler's own unsubscribe and teardown()'s goodbye were stops for nothing.
		const { self } = bindOnTakenPort()

		expect(stops(self)).toHaveLength(0)

		await self.teardown()
		expect(stops(self)).toHaveLength(0)
	})

	it('lets a pushed update prove the camera is still there', async () => {
		// A subscription-only camera can go minutes without an HTTP request, so one failed request
		// would otherwise sit at failures > 0 until the fallback declared a connection lost that had
		// been pushing updates the whole time.
		vi.useFakeTimers()
		const self = makeInstance()
		self.init_tcp()

		self.handleConnectionError({ code: 'ECONNRESET' })
		expect(self.failures).toBe(1)
		expect(vi.getTimerCount()).toBe(1)

		// Frame layout per Interface Specifications §4.2: [Reserve 22][Size 2][Reserve 4][CRLF cmd CRLF][Reserve 24]
		const info = Buffer.concat([Buffer.from('\r\n'), Buffer.from('p1', 'latin1'), Buffer.from('\r\n')])
		const header = Buffer.alloc(28, 0x01)
		header.writeUInt16BE(info.length + 8, 22)

		const socket = { ...fakeSocket(), on: vi.fn() }
		net.createServer.mock.calls[0][0](socket)
		const onData = socket.on.mock.calls.find(([event]) => event === 'data')[1]
		onData(Buffer.concat([header, info, Buffer.alloc(24, 0x02)]))

		expect(self.data.power).toBe('1') // the batch really was parsed
		expect(self.failures).toBe(0)
		expect(vi.getTimerCount()).toBe(0)
		vi.useRealTimers()
	})

	it('still reports the port conflict to the operator', () => {
		const { self } = bindOnTakenPort()

		expect(self.updateStatus).toHaveBeenCalledWith('unknown_error', 'TCP Port in use')
		expect(self.log.mock.calls.some(([, message]) => message.includes('already in use'))).toBe(true)
	})
})

describe('destroy', () => {
	it('leaves nothing behind, even when the camera is already gone', async () => {
		// Deleting a connection to an offline camera used to make the failed goodbye look like a lost
		// connection, scheduling a re-init that rebuilt a thrown-away instance seconds later.
		vi.useFakeTimers()
		const self = makeInstance()
		const socket = fakeSocket()

		self.server = fakeServer()
		self.clients = [socket]
		self.httpGet = vi.fn().mockRejectedValue(Object.assign(new Error('gone'), { code: 'EHOSTUNREACH' }))

		await self.destroy()

		expect(vi.getTimerCount()).toBe(0) // nothing waiting to bring it back
		expect(socket.destroy).toHaveBeenCalled()
		expect(self.server).toBeUndefined()
		vi.useRealTimers()
	})
})

describe('the status poll loop', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	function pollable() {
		const self = makeInstance({ subscriptionEnable: true }, { capabilities: { poll: { cam: ['QID'] } } })
		self.getCam = vi.fn(async () => {})
		return self
	}

	it('dies on a teardown, even though the next connection turns polling back on', async () => {
		// The flag alone cannot prove this: `poll` is false during teardown and true again a moment later,
		// so a loop parked in an await wakes to a flag that says "keep going".
		const self = pollable()
		self.poll = true
		pollCameraStatus(self)

		await vi.advanceTimersByTimeAsync(250)
		const beforeTeardown = self.getCam.mock.calls.length

		await self.teardown()
		self.poll = true // what reInitAll does next

		await vi.advanceTimersByTimeAsync(1000)
		expect(self.getCam).toHaveBeenCalledTimes(beforeTeardown) // the old loop is gone for good
	})

	it('leaves one loop running across a re-init, not two', async () => {
		const self = pollable()
		self.poll = true
		pollCameraStatus(self)
		await vi.advanceTimersByTimeAsync(250)

		await self.teardown()
		self.poll = true
		pollCameraStatus(self)

		self.getCam.mockClear()
		await vi.advanceTimersByTimeAsync(1000)
		const oneLoop = self.getCam.mock.calls.length

		// A second loop would double the command rate, and every reconnect used to add another.
		expect(oneLoop).toBeLessThanOrEqual(11)
		expect(oneLoop).toBeGreaterThan(0)
	})
})

// `poll` is state the camera never reports on its own; `pull` stands in for a disabled subscription.
// The loop used to start on `poll` alone, so a camera that has only a pull list (AK-UB300, AK-UB50,
// AW-HR140) read its state once at connect and then went stale for the rest of the session.
describe('starting the status poll loop', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	// The real model tables, so the test breaks if a series' poll/pull shape changes underneath it.
	async function connect(model, subscriptionEnable) {
		const self = makeInstance({ model, subscriptionEnable })
		await self.reInitAll()
		const started = self.poll
		self.poll = false // park the loop before the timers go away
		return { self, started }
	}

	it('runs for a pull-only camera once the subscription is off', async () => {
		const { self, started } = await connect('AK-UB300', false)

		expect(self.SERIES.capabilities.poll).toBe(false)
		expect(self.SERIES.capabilities.pull).toBeTruthy()
		expect(started).toBe(true)
	})

	it('stays off for that same camera while the subscription is on', async () => {
		// Not just wasteful: with poll false the loop has nothing to await and would spin the event loop.
		const { started } = await connect('AK-UB300', true)

		expect(started).toBe(false)
	})

	it('still runs for a camera with a poll list, subscription or not', async () => {
		expect((await connect('AW-UE80', true)).started).toBe(true)
		expect((await connect('AW-UE80', false)).started).toBe(true)
	})

	it('respects the pollAllow switch either way', async () => {
		const self = makeInstance({ model: 'AK-UB300', subscriptionEnable: false, pollAllow: false })
		await self.reInitAll()

		expect(self.poll).toBe(false)
	})
})

// Not every camera serves its still image from view.cgi: the AW-HE130 and AW-HR140 have no view.cgi
// at all and put their one-shot on /cgi-bin/camera. getImage() therefore builds the URL from the
// capability rather than from a constant. The stubbed httpGet answers with an empty body, so the Jimp
// decode fails and the error path runs - by then the URL is already recorded.
describe('the live image URL', () => {
	const imaging = (capabilities) => {
		const self = makeInstance({ imageEnable: true }, { capabilities })
		self.checkFeedbacks = vi.fn()
		return self
	}

	const images = (self) => self.requests.filter((u) => u.includes('/cgi-bin/'))

	it('leaves the endpoint that has always worked exactly as it was', async () => {
		const self = imaging({ imageTransmission: { cmd: 'view.cgi?action=snapshot' } })
		await self.getImage()

		expect(images(self)).toEqual(['http://10.0.0.1:80/cgi-bin/view.cgi?action=snapshot'])
	})

	it('asks the models without view.cgi for their one-shot instead', async () => {
		const self = imaging({ imageTransmission: { cmd: 'camera?resolution=320' } })
		await self.getImage()

		expect(images(self)).toEqual(['http://10.0.0.1:80/cgi-bin/camera?resolution=320'])
	})

	// The specs offer a "Dummy for disabling cache" parameter on both endpoints, but that is a browser
	// concern: got is given no cache store, so nothing between here and the camera holds a response.
	it('sends the same URL every time, carrying no cache-buster', async () => {
		const self = imaging({ imageTransmission: { cmd: 'camera?resolution=320' } })

		await self.getImage()
		await self.getImage()

		const [first, second] = images(self)
		expect(first).toBe(second)
		expect(first).not.toContain('page=')
	})

	it('asks for nothing at all where the camera has no still image', async () => {
		const self = imaging({ imageTransmission: false })
		await self.getImage()

		expect(images(self)).toEqual([])
	})
})

// The Custom Command action is the only caller that cares what came back: a query the module does not
// model parses to nothing, so the raw reply is all an operator has. The transports used to return
// undefined to everyone.
describe('the reply a transport hands back', () => {
	const answering = (body) => {
		const self = makeInstance()
		self.httpGet = vi.fn(async (url) => {
			self.requests.push(url)
			return { body, statusCode: 200 }
		})
		return self
	}

	it('gives the camera command reply to its caller', async () => {
		expect(await answering('OID:AW-UE150\r\n').getCam('QID')).toBe('OID:AW-UE150')
	})

	it('gives the pan/tilt reply to its caller', async () => {
		expect(await answering('lC11').getPTZ('LC1')).toBe('lC11')
	})

	it('reports the status code where the web reply carries no body', async () => {
		expect(await answering('').getWeb('initial?cmd=reset')).toBe('Response code 200')
	})

	it('hands back nothing when the request fails, so the variable clears', async () => {
		const self = makeInstance()
		self.httpGet = vi.fn(async () => {
			throw Object.assign(new Error('gone'), { code: 'ECONNREFUSED' })
		})

		expect(await self.getCam('QID')).toBeUndefined()
	})
})

describe('configUpdated', () => {
	it('wipes the old camera state before the new camera speaks', async () => {
		const self = makeInstance({ host: '10.0.0.1' })
		self.reInitAll = vi.fn() // rebuild covered elsewhere; this is about the handover

		self.data.tally = '1'
		self.data.title = 'Camera A'
		self.data.presetThumbnails[0] = 'data:image/png;base64,AAAA'

		await self.configUpdated({ ...self.config, host: '10.0.0.2' })

		expect(self.data.tally).toBeNull()
		expect(self.data.title).toBeNull()
		expect(self.data.presetThumbnails[0]).toBeUndefined()
		expect(self.config.host).toBe('10.0.0.2')
	})

	it('unsubscribes the old host before adopting the new one', async () => {
		const self = makeInstance({ host: '10.0.0.1' })
		self.server = fakeServer()
		self.reInitAll = vi.fn()

		await self.configUpdated({ ...self.config, host: '10.0.0.2' })

		expect(stops(self)).toHaveLength(1)
		expect(stops(self)[0]).toContain('10.0.0.1') // the camera being left
		expect(stops(self)[0]).not.toContain('10.0.0.2') // never the one being joined
	})
})

// aw_ptz and aw_cam answer 200 whatever happens and put a refusal in the body, so the module's only
// evidence that a command went nowhere used to be dropped on the floor by parseUpdate.
describe('a command the camera refuses', () => {
	const answering = (body) => {
		const self = makeInstance()
		self.httpGet = vi.fn(async () => ({ body, statusCode: 200 }))
		return self
	}

	// getPTZ/getCam also trace the request and the response; those are not what these tests are about.
	const logs = (self) => self.log.mock.calls.filter(([, message]) => !/^(PTZ|Cam) (request|response)/.test(message))

	it('is not fed to the update parser, which would silently match nothing in it', async () => {
		const self = answering('ER1:QSL\r\n')
		await self.getCam('QSL:36')

		expect(self.data.model).toBe('Auto') // untouched
	})

	// Still an answer, so the connection is demonstrably alive and any failure streak is over.
	it('still counts as the camera being reachable', async () => {
		const self = answering('eR1:XF\r\n')
		self.handleConnectionError({ code: 'ECONNRESET' })

		await self.getPTZ('XF')

		expect(self.failures).toBe(0)
		expect(self.updateStatus.mock.calls.at(-1)).toEqual(['ok', null])
	})

	it('tells the operator when it was their button that went nowhere', async () => {
		const self = answering('ER1:QSH\r\n')
		await self.getCam('QSH')

		expect(logs(self)).toEqual([['warn', 'Camera does not support "QSH"']])
	})

	// Busy is the camera's own business and clears itself, so polling it is not worth a word — but a
	// button press that vanished into a busy camera is.
	it('tells the operator when a busy camera swallowed their button press', async () => {
		const self = answering('eR2:AXZ\r\n')
		await self.getPTZ('AXZ')

		expect(logs(self)).toEqual([['warn', 'Camera busy, "AXZ" not executed']])
	})

	// The poll loop only ever asks a model for what its own capabilities list, so a refusal there is
	// no more routine than a refused button — it says the model table is wrong. Same words either way.
	it('says the same thing when it was the poll loop that was refused', async () => {
		const self = answering('ER1:QSH\r\n')
		await self.getCam('QSH', { polled: true })

		expect(logs(self)).toEqual([['warn', 'Camera does not support "QSH"']])
	})

	// Out of range is the module's own fault: it built a value the command does not accept.
	it('treats a value the command will not take as the module bug it is', async () => {
		const self = answering('ER3:OGU\r\n')
		await self.getCam('OGU:90')

		expect(logs(self)).toEqual([['error', 'Camera rejected "OGU": value outside the acceptable range']])
	})
})

// aw_cam answers a control command by handing the value back, a query by reporting the camera's own
// state. For White Balance those are two encodings of the same mode and the reply is identical
// either way, so getCam has to say which it asked for — nothing downstream can work it out.
describe('reading a value back versus being told one', () => {
	const camera = (body) => {
		const self = makeInstance()
		self.SERIES = { id: 'HE40', capabilities: { whiteBalance: { confirm: { 2: '1', 3: '2' } } } }
		self.httpGet = vi.fn(async () => ({ body, statusCode: 200 }))
		return self
	}

	it('maps what a query reports onto the settable mode', async () => {
		const self = camera('OAW:3\r\n')
		await self.getCam('QAW')

		expect(self.data.whiteBalance).toBe('2') // the camera means AWC B
	})

	it("takes an action's own value back unchanged", async () => {
		const self = camera('OAW:3\r\n')
		await self.getCam('OAW:3') // set ATW

		expect(self.data.whiteBalance).toBe('3') // still the ATW that was sent
	})
})
