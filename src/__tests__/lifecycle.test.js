import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PanasonicCameraInstance, { REACHABILITY_ERRORS, describeError } from '../index.js'
import { pollCameraStatus } from '../polling.js'
import { initialData } from '../data.js'

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
		debug: false,
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

		expect(self.handleConnectionError({ code })).toBe(true)

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['connection_failure'])
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
		expect(self.handleConnectionError({ code: 'ERR_BODY_PARSE_FAILURE' })).toBe(true)

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
		expect(self.handleConnectionError({ code: 'ERR_ABORTED' })).toBe(false)

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

	it('keeps Disconnected for the one thing the user did on purpose', async () => {
		const self = makeInstance()
		self.reInitAll = vi.fn()

		await self.configUpdated({ ...self.config, host: '10.0.0.2' })

		expect(self.updateStatus.mock.calls.map(([status]) => status)).toEqual(['disconnected'])
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
