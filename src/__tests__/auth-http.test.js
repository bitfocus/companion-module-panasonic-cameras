import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceStatus } from '@companion-module/base'
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import PanasonicCameraInstance from '../index.js'
import { createAuthSession, requestWithAuth } from '../auth.js'
import { initialData } from '../data.js'
import { getCameraStatusOnce, startLiveImagePoll } from '../polling.js'
import { describeAuth } from '../config.js'

// End to end through real got against a real server, because everything above httpGet is stubbed in
// lifecycle.test.js and the handshake is exactly the part that stubbing hides. Its own file: that
// suite mocks `net` for the whole module graph, which would take this server's listener with it.
//
// The server imitates an AW-HE40 — its challenge carries no algorithm and no opaque, only
// realm="Control" and qop="auth", which is what the hardware was measured to send.

const REALM = 'Control'
const md5 = (value) => createHash('md5').update(value, 'utf8').digest('hex')

function camera({
	scheme: initialScheme = 'none',
	username = 'admin',
	password = '12345',
	body = 'OID:AW-HE40\r\n',
	// A path the camera turns down outright, whatever the login: { path, code }.
	refuse = null,
} = {}) {
	let scheme = initialScheme
	const requests = []
	let nonce = 'nonce-one'
	let staleOnce = false

	const server = createServer((req, res) => {
		const authorization = req.headers.authorization ?? null
		requests.push({ url: req.url, authorization })

		const deny = (which = scheme, extra = '') => {
			const challenge =
				which === 'digest' ? `Digest realm="${REALM}", nonce="${nonce}", qop="auth"${extra}` : `Basic realm="${REALM}"`
			res.writeHead(401, { 'www-authenticate': challenge })
			res.end('denied')
		}

		// The Admin CGI challenges on every camera, even one whose "User auth." is off — measured on an
		// AW-HE40, where /cgi-bin/initial answers 401 while aw_cam answers 200 to the same request.
		if (refuse && req.url.includes(refuse.path)) {
			res.writeHead(refuse.code)
			return res.end('refused')
		}

		const admin = req.url.startsWith('/cgi-bin/initial')
		const wants = admin && scheme === 'none' ? 'basic' : scheme

		if (wants === 'none') {
			res.writeHead(200, { 'content-type': 'text/plain' })
			return res.end(body)
		}

		if (!authorization) return deny(wants)

		if (staleOnce) {
			// One rotation, to exercise the path where credentials are fine but the nonce aged out.
			staleOnce = false
			nonce = 'nonce-two'
			return deny(scheme, ', stale=true')
		}

		if (wants === 'basic') {
			const expected = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
			if (authorization !== expected) return deny(wants)
		} else {
			const field = (name) => new RegExp(`${name}="?([^",]+)"?`).exec(authorization)?.[1]

			// Hash against the URL this request actually arrived on, never against the uri the client
			// claims. Taking the client's word would make the server agree with any uri it was handed —
			// including the path without its query, which is the mistake this is here to catch.
			const ha1 = md5(`${field('username')}:${REALM}:${password}`)
			const ha2 = md5(`GET:${req.url}`)
			const expected = md5(`${ha1}:${field('nonce')}:${field('nc')}:${field('cnonce')}:auth:${ha2}`)

			if (field('uri') !== req.url || field('response') !== expected || field('nonce') !== nonce) return deny(wants)
		}

		res.writeHead(200, { 'content-type': 'text/plain' })
		res.end(body)
	})

	return {
		requests,
		rotateNonceOnce: () => (staleOnce = true),
		// "User auth." being switched on at the camera while the connection is already running.
		demandAuth: (which) => (scheme = which),
		listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port))),
		close: () => new Promise((resolve) => server.close(resolve)),
	}
}

// The real prototype against a real socket; only the Companion-facing calls are stubbed.
function instance(port, credentials) {
	const self = Object.create(PanasonicCameraInstance.prototype)

	self.config = {
		host: '127.0.0.1',
		httpPort: port,
		timeout: 2000,
		pollDelay: 100,
		imageEnable: true,
		imageInterval: 1000,
		trace: false,
		model: 'Auto',
		// Where the user name lives in production; the password is in the secret store beside it.
		username: credentials?.username ?? '',
	}
	self.secrets = credentials?.password ? { password: credentials.password } : {}
	self.data = initialData()
	self.SERIES = { id: 'HE40', capabilities: { presetThumbnails: true, imageTransmission: { cmd: 'view.cgi' } } }

	self.generation = 0
	self.aborter = new AbortController()
	self.reconnecting = false
	self.reportedStatus = undefined
	self.auth = createAuthSession(credentials)
	self.reportedAuth = new Set()

	self.log = vi.fn()
	self.updateStatus = vi.fn()
	self.checkVariables = vi.fn()
	self.checkAllFeedbacks = vi.fn()
	self.checkFeedbacks = vi.fn()

	return self
}

const CREDENTIALS = { username: 'admin', password: '12345' }
const authorizations = (server) => server.requests.map((r) => r.authorization)

describe.each(['digest', 'basic'])('a camera asking for %s authentication', (scheme) => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme })
		port = await server.listen()
	})
	afterEach(() => server.close())

	it('answers the challenge and gets through', async () => {
		const self = instance(port, CREDENTIALS)

		expect(await self.getCam('QID')).toBe('OID:AW-HE40')
		expect(server.requests).toHaveLength(2) // one to be asked, one to answer
		expect(authorizations(server)).toEqual([null, expect.stringMatching(scheme === 'digest' ? /^Digest / : /^Basic /)])
	})

	// The requirement the whole caching design exists for. This module polls continuously; a
	// handshake per request would double its traffic for the life of the connection.
	it('costs nothing once the handshake is done', async () => {
		const self = instance(port, CREDENTIALS)

		await self.getCam('QID')
		server.requests.length = 0

		await self.getCam('QID')
		await self.getPTZ('O') // '#O' goes on the wire as %23O, inside the query the hash covers
		await self.getCameraStatus()

		expect(server.requests).toHaveLength(3) // one each, no re-handshake
		expect(server.requests.some((r) => r.url.includes('%23O'))).toBe(true)
		expect(authorizations(server).every((a) => a !== null)).toBe(true)
	})

	it('reports a refused login rather than leaving the connection blank', async () => {
		const self = instance(port, { username: 'admin', password: 'wrong' })

		await self.getCam('QID')

		expect(server.requests).toHaveLength(2) // asked, answered, and then it stops
		expect(self.updateStatus).toHaveBeenCalledWith('authentication_failure', 'Login rejected')
	})

	// The case behind issue #78: the camera wants a login and none is configured.
	it('says a login is needed when none is configured', async () => {
		const self = instance(port, {})

		await self.getCam('QID')

		expect(server.requests).toHaveLength(1) // nothing to retry with, so it does not
		expect(self.updateStatus).toHaveBeenCalledWith('authentication_failure', 'Login required')
		expect(self.log.mock.calls.find(([level]) => level === 'error')?.[1]).toContain('requires a login')
	})
})

// Everything reInitAll calls that belongs to Companion rather than to the camera.
const initialising = (self) => {
	// Everything reInitAll calls that belongs to Companion rather than to the camera.
	for (const name of [
		'init_variables',
		'init_actions',
		'init_feedbacks',
		'init_presets',
		'init_tcp',
		'setVariableDefinitions',
		'setVariableValues',
		'setActionDefinitions',
		'setFeedbackDefinitions',
		'setPresetDefinitions',
	]) {
		self[name] = vi.fn()
	}

	self.clients = []
	self.poll = false
	self.pollGen = 0
	self.pollImage = false
	self.pollImageGen = 0
	self.imageSubscribers = new Map()
	self.tcpPortSelected = 31004
	self.config.subscriptionEnable = false
	self.config.pollAllow = true

	return self
}

describe('a camera that asks for nothing', () => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme: 'none' })
		port = await server.listen()
	})
	afterEach(() => server.close())

	it('is never sent an Authorization header, even with credentials configured', async () => {
		const self = instance(port, CREDENTIALS)

		await self.getCam('QID')
		await self.getPTZ('O')

		expect(server.requests).toHaveLength(2)
		expect(authorizations(server)).toEqual([null, null])
		expect(self.auth.scheme).toBe('none')
	})
})

describe('a Digest camera whose nonce ages out', () => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme: 'digest' })
		port = await server.listen()
	})
	afterEach(() => server.close())

	// A fresh nonce with the same credentials is not a refusal, and must not be reported as one.
	it('re-handshakes without calling it a bad password', async () => {
		const self = instance(port, CREDENTIALS)

		await self.getCam('QID')
		server.requests.length = 0
		server.rotateNonceOnce()

		expect(await self.getCam('QID')).toBe('OID:AW-HE40')
		expect(server.requests).toHaveLength(2) // refused once, accepted on the retry
		expect(self.updateStatus).not.toHaveBeenCalledWith('authentication_failure', 'Login rejected')
	})
})

describe('the request paths that used to swallow a 401', () => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme: 'digest' })
		port = await server.listen()
	})
	afterEach(() => server.close())

	// Both deliberately bypass handleConnectionError, because one lost frame says nothing about the
	// connection. A refused login is not one lost frame, and used to show as a black button alone.
	it.each([
		['the live image', (self) => self.getImage()],
		['a preset thumbnail', (self) => self.getThumbnail(0)],
	])('reports a refused login from %s', async (_name, run) => {
		const self = instance(port, {})

		await run(self)

		expect(self.updateStatus).toHaveBeenCalledWith('authentication_failure', 'Login required')
	})
})

// teardown() hands unsubscribeTCPEvents the config of the connection being left behind, so the
// goodbye reaches the old camera at its own address. Its login has to travel with it: changing
// address and password together is an ordinary thing to do, and authenticating the farewell with
// the new camera's credentials would leave the old one pushing to a port nobody listens on.
describe('saying goodbye to the camera being left behind', () => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme: 'digest', password: 'old-password' })
		port = await server.listen()
	})
	afterEach(() => server.close())

	it('uses the old login, not the one just entered', async () => {
		const self = instance(port, { username: 'admin', password: 'old-password' })
		self.server = { close: vi.fn() }
		self.clients = []
		self.tcpPortSelected = 31004
		self.poll = false
		self.pollGen = 0
		self.pollImage = false
		self.pollImageGen = 0

		await self.getCam('QID') // establish the session against the old camera
		server.requests.length = 0

		const old = self.auth
		// What configUpdated does: a new password arrives, and the farewell goes out before it applies.
		self.auth = createAuthSession({ username: 'admin', password: 'new-password' })
		await self.teardown(self.config, old)

		const goodbye = server.requests.filter((r) => r.url.includes('connect=stop'))
		expect(goodbye).toHaveLength(1)
		expect(goodbye[0].authorization).toMatch(/^Digest /)
		// Accepted on the first try: the old session's nonce is still good, so no handshake was needed
		// inside the grace window teardown allows.
		expect(server.requests).toHaveLength(1)
	})
})

// The panel line is the only place that separates "this camera needs no login" from "nothing has
// been tried yet" — the connection status shows Ok for both, and a user with an unused user name in
// the fields has no other way to find out it is unused.
describe('what the settings panel reports', () => {
	// The state is still tracked — it is what keeps a later refusal from being read as the first word
	// on the subject — but a camera that never asks is the ordinary case, and the panel stays quiet.
	it.each([
		['a camera that never asks', {}],
		['credentials left unused', CREDENTIALS],
	])('settles on none and says nothing for %s', async (_name, credentials) => {
		const server = camera({ scheme: 'none' })
		const port = await server.listen()
		const self = instance(port, credentials)

		await self.getCam('QID')

		expect(self.data.auth.state).toBe('none')
		expect(describeAuth(self.data)).toBe('')
		await server.close()
	})

	it.each(['digest', 'basic'])('names %s once the camera has asked for it', async (scheme) => {
		const server = camera({ scheme })
		const port = await server.listen()
		const self = instance(port, CREDENTIALS)

		await self.getCam('QID')

		expect(self.data.auth).toEqual({ state: 'authenticated', scheme, realm: REALM })
		await server.close()
	})
})

// A wrong password used to take the whole instance down with it: reInitAll carried on through the
// model's entire pull list, spending one failing request per command, until Companion's own init
// call timed out and killed the process. Measured at 22 seconds against a real camera.
describe('a connection whose login is refused', () => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme: 'digest' })
		port = await server.listen()
	})
	afterEach(() => server.close())

	it.each([
		['no credentials at all', {}],
		['the wrong password', { username: 'admin', password: 'wrong' }],
	])('stops after the first command rather than working through the list, given %s', async (_name, credentials) => {
		const self = initialising(instance(port, credentials))

		await self.reInitAll()

		// One command asked, and whatever answering it took. Nothing beyond that.
		expect(server.requests.filter((r) => r.url.includes('QID'))).toHaveLength(credentials.username ? 2 : 1)
		expect(server.requests.every((r) => r.url.includes('QID'))).toBe(true)
	})

	it('does not start the poll loop, which would ask twenty times a second to be told no', async () => {
		const self = initialising(instance(port, {}))

		await self.reInitAll()

		expect(self.poll).toBe(false)
		expect(self.auth.blocked).toBe(true)
	})

	it('still gets through, and polls, once the password is right', async () => {
		const self = initialising(instance(port, CREDENTIALS))

		await self.reInitAll()

		expect(self.auth.blocked).toBe(false)
		expect(self.init_actions).toHaveBeenCalled()
		expect(server.requests.length).toBeGreaterThan(2)
	})

	// Everything runs on the connection's own login now, restart included. What separates a dead
	// connection from a failed button press is therefore not whose credentials were used, but whether
	// the repeating traffic was the thing turned away.
	it('is not taken down by a button press the camera refuses', async () => {
		const open = camera({ scheme: 'none' })
		const openPort = await open.listen()
		const self = initialising(instance(openPort, {}))

		await self.reInitAll()
		expect(self.poll).toBe(true)

		// The Admin path is the one thing this camera asks about, and nothing was given for it.
		await self.getWeb('initial?cmd=reset&Randomnum=12345')

		expect(self.poll).toBe(true)
		expect(self.pollImage).toBe(false)

		// Marking the session would only surface later: reInitAll bails on a blocked session, so a
		// connection the camera serves happily would die at its next reconnect over one button press.
		expect(self.auth.blocked).toBe(false)
		await open.close()
	})

	it('rebuilds afterwards as if the button had never been pressed', async () => {
		const open = camera({ scheme: 'none' })
		const openPort = await open.listen()
		const self = initialising(instance(openPort, {}))

		await self.reInitAll()
		await self.getWeb('initial?cmd=reset&Randomnum=12345')

		open.requests.length = 0
		await self.reInitAll()

		expect(self.poll).toBe(true)
		expect(open.requests.length).toBeGreaterThan(2)
		await open.close()
	})

	// The camera answers the handshake, then refuses the credentials it asked for. Announcing the
	// handshake before the retry comes back would leave the config panel reading "Logged in with
	// Basic authentication" about a login the camera had just turned down.
	it('does not claim a login the camera went on to refuse', async () => {
		const open = camera({ scheme: 'none' })
		const openPort = await open.listen()
		const self = initialising(instance(openPort, { username: 'admin', password: 'wrong' }))

		await self.reInitAll()
		expect(self.data.auth.state).toBe('none')

		await self.getWeb('initial?cmd=reset&Randomnum=12345')

		expect(self.data.auth.state).toBe('none')
		await open.close()
	})

	it('is not taken down by a refused restart on a camera that does need a login', async () => {
		const self = initialising(instance(port, CREDENTIALS))
		await self.reInitAll()
		self.poll = true

		// A camera-control account that the camera will not accept for an Admin command.
		self.auth.password = 'wrong'
		await self.getWeb('initial?cmd=reset&Randomnum=12345')

		expect(self.poll).toBe(true)
	})
})

// The poll loop runs at up to twenty requests a second. Switching "User auth." on at the camera
// while a connection is running turns every one of those into a 401, so the loop has to stop rather
// than spend a request each on being told no.
describe('a camera that starts demanding a login mid-connection', () => {
	let server, port

	beforeEach(async () => {
		server = camera({ scheme: 'none' })
		port = await server.listen()
	})
	afterEach(() => server.close())

	it('stops the loops instead of asking twenty times a second', async () => {
		const self = instance(port, {})
		self.poll = true
		self.pollImage = true

		await self.getCam('QID') // settles on sending nothing
		expect(self.poll).toBe(true)

		server.demandAuth('digest')
		await self.getCam('QID', { polled: true }) // as the poll loop asks

		expect(self.poll).toBe(false)
		expect(self.pollImage).toBe(false)
		expect(self.updateStatus).toHaveBeenCalledWith('authentication_failure', 'Login required')
	})
})

// A brand-new connection starts with the factory login filled in, because the camera guards its
// Admin level on every model — without one, the restart action cannot work on a factory camera at
// all. Written once, into a connection that has just been created, rather than as a field default:
// a default would apply to every connection that has none and erase the difference between "no login
// configured" and "this one".
// Nothing in init writes a login any more: both fields declare the factory login as their default,
// and Companion seeds them from there when a connection is created. What must stay true is that a
// connection which already existed comes through untouched — its empty fields are an answer.
describe('a connection being created for the first time', () => {
	it('writes no config of its own, whichever way it was started', async () => {
		const server = camera({ scheme: 'none' })
		const port = await server.listen()

		for (const isFirstInit of [true, false]) {
			const self = instance(port, {})
			self.saveConfig = vi.fn()
			self.reInitAll = vi.fn(async () => {})
			delete self.config.username

			await self.init({ host: '127.0.0.1', httpPort: port }, isFirstInit, {})

			expect(self.saveConfig, String(isFirstInit)).not.toHaveBeenCalled()
			expect(self.config.username, String(isFirstInit)).toBeUndefined()
			expect(self.secrets.password, String(isFirstInit)).toBeUndefined()
		}

		await server.close()
	})
})

// Three failures the review found, each in a state the loopback server can actually produce.
describe('refusals that arrive after the connection is up', () => {
	const running = (self) => {
		self.poll = true
		self.pollImage = true
		self.pollGen = 0
		self.pollImageGen = 0
		self.imageErrors = 0
		self.imageSubscribers = new Map()
		return self
	}

	// The image loop is repeating traffic like the poll loop, and a login refused there is the
	// connection's problem. Left as a one-off command refusal it neither says so nor stops, and the
	// loop spends a 401 on being told no once per image interval for as long as a button shows it.
	it('stops the image loop when the camera starts asking it for a login it will not take', async () => {
		const server = camera({ scheme: 'none' })
		const port = await server.listen()
		const self = running(instance(port, { username: 'admin', password: 'wrong' }))

		await self.getCam('QID') // the connection is up and has needed no login so far
		expect(self.auth.ok).toBe(true)

		server.demandAuth('basic') // "User auth." switched on at the camera, and the password is wrong
		await self.getImage()

		expect(self.pollImage).toBe(false)
		expect(self.auth.blocked).toBe(true)

		// The feedback re-registers on every evaluation, so the loop is only really stopped if its start
		// refuses to run again. It needs a live subscriber to get past its own first check — with none,
		// the loop ends by itself and would pass this whether the guard is there or not.
		self.imageSubscribers.set('feedback-1', Date.now())
		startLiveImagePoll(self)
		expect(self.pollImage).toBe(false)

		// And a request still in flight when the refusal landed must not paint the connection green
		// again, with both loops down and nothing left watching it.
		self.updateStatus.mockClear()
		self.onRequestSucceeded()
		expect(self.updateStatus).not.toHaveBeenCalled()

		await server.close()
	})

	// The auth layer answers 401 and nothing else, so a 403 has only this backstop. Gating it on the
	// latch having anything in it disarmed it on every connection that works: the ordinary "this
	// camera never asks for a login" note lands there on the first successful request.
	// A 403 says the login was taken and the account may not do this. Nothing a later request can send
	// changes that, so on repeating traffic it has to stop the loops the way a refused login does —
	// which used to be the difference between the two codes: 403 only ever moved the status, and both
	// loops carried on issuing and logging the same forbidden request.
	it('stops the loops when repeating traffic is forbidden', async () => {
		const server = camera({ scheme: 'none', refuse: { path: 'QID', code: 403 } })
		const port = await server.listen()
		const self = running(instance(port, CREDENTIALS))

		await self.getCam('QID', { polled: true })

		expect(self.auth.blocked).toBe(true)
		expect(self.poll).toBe(false)
		expect(self.pollImage).toBe(false)
		expect(self.updateStatus).toHaveBeenCalledWith(InstanceStatus.InsufficientPermissions, 'Insufficient permissions')
		await server.close()
	})

	// One command the account may not run is not a broken connection — the same distinction a refused
	// restart button already gets.
	it('leaves the connection alone when one command is forbidden', async () => {
		const server = camera({ scheme: 'none', refuse: { path: 'initial', code: 403 } })
		const port = await server.listen()
		const self = running(instance(port, CREDENTIALS))

		await self.getCam('QID') // the connection is up
		self.updateStatus.mockClear()

		await self.getWeb('initial?cmd=reset&Randomnum=12345')

		expect(self.auth.blocked).toBe(false)
		expect(self.poll).toBe(true)
		expect(self.updateStatus).not.toHaveBeenCalled()
		expect(self.log.mock.calls.filter(([level]) => level === 'error')).toHaveLength(1)
		await server.close()
	})
})

describe('what the debug log claims about a login', () => {
	const lines = (self) => self.log.mock.calls.filter(([level]) => level === 'debug').map(([, text]) => text)

	it.each(['digest', 'basic'])('names the method the camera asked for, %s', async (scheme) => {
		const server = camera({ scheme })
		const port = await server.listen()
		const self = instance(port, CREDENTIALS)

		await self.getCam('QID')

		expect(lines(self)).toContainEqual(`Camera asked for ${scheme} authentication (realm "Control"); authenticated.`)
		await server.close()
	})

	// A 401 with no WWW-Authenticate at all is answered with Basic on spec. Saying the camera asked
	// for Basic would put words in its mouth — it named nothing.
	it('does not claim the camera asked for a method it never named', async () => {
		const self = instance(1, CREDENTIALS)
		let sends = 0

		self.httpGet = (url, options) =>
			requestWithAuth(
				async () => {
					if (sends++ === 0) throw { response: { statusCode: 401, headers: {} } }
					return { body: 'OID:AW-HE40\r\n' }
				},
				{ session: self.auth, uri: '/x', report: (event) => self.reportAuthEvent(event, url, options?.polled) },
			)

		await self.getCam('QID')

		expect(lines(self)).toContainEqual('Camera answered HTTP 401 naming no method; authenticated with basic.')
	})

	// The success line used to live in the switch's default branch, where any event type added later
	// would be announced as a login that went through.
	it('does not announce an unknown event as a successful login', () => {
		const self = instance(1, CREDENTIALS)

		self.reportAuthEvent({ type: 'something-new' }, 'http://x/')

		expect(lines(self)).toEqual(['Unhandled authentication event "something-new".'])
	})
})

// The image and thumbnail paths deliberately bypass handleConnectionError — a dropped frame is no
// evidence the control connection is gone — which used to take the auth rejections with it.
describe('an account without the rights for the picture', () => {
	it.each([
		['the live image', 'view.cgi', (self) => self.getImage()],
		['a preset thumbnail', 'get_preset_thumbnail', (self) => self.getThumbnail(1)],
	])('reports a 403 from %s', async (_name, path, run) => {
		const server = camera({ scheme: 'none', refuse: { path, code: 403 } })
		const port = await server.listen()
		const self = instance(port, {})
		self.imageErrors = 0
		self.data.presetThumbnails = {}

		await run(self)

		expect(self.updateStatus).toHaveBeenCalledWith(InstanceStatus.InsufficientPermissions, 'Insufficient permissions')
		await server.close()
	})
})

// A refused login used to be logged twice: the auth layer's line naming the cause, and a generic
// "request failed" behind it carrying nothing the first did not already say.
describe('a login refusal that has already been reported', () => {
	it('is not logged a second time by the request that met it', async () => {
		const server = camera({ scheme: 'basic' })
		const port = await server.listen()
		const self = instance(port, {}) // nothing to answer the challenge with

		await self.getWeb('get_basic')

		const errors = self.log.mock.calls.filter(([level]) => level === 'error')

		expect(errors).toHaveLength(1)
		expect(errors[0][1]).toContain('requires a login')
		await server.close()
	})
})

// got 15 retries a GET twice by itself. Underneath a module that retries in two bounded places of its
// own, that turns one refusal into three requests and holds a dead camera back from scheduleReInit
// for seconds before anything notices.
describe('requests that the camera turns down', () => {
	it('sends exactly one, rather than letting got try again underneath', async () => {
		const server = camera({ scheme: 'none', refuse: { path: 'get_basic', code: 503 } })
		const port = await server.listen()
		const self = instance(port, {})

		await self.getWeb('get_basic')

		expect(server.requests).toHaveLength(1)
		await server.close()
	})
})

// A camera that is simply gone. getCam swallows the error and books a reconnect, and reInitAll used
// to carry on through the whole list against it — ending by starting a poll loop that the booked
// attempt would then start a second time.
describe('a camera that has vanished', () => {
	it('gives up rather than working through the command list', async () => {
		const server = camera({ scheme: 'none' })
		const port = await server.listen()
		await server.close() // nothing is listening any more

		const self = initialising(instance(port, {}))

		await self.reInitAll()

		expect(self.reconnecting).toBe(true)
		expect(self.poll).toBe(false)
		expect(self.init_actions).not.toHaveBeenCalled()

		clearTimeout(self.timeoutID) // the reconnect this booked belongs to nobody now
	})
})

// The getters swallow a reachability error and book a reconnect. Carrying on through the rest of the
// list means every remaining request fails too — and each failure re-arms the reconnect timer, so a
// series with a long pull list pushes its own retry out past Companion's init timeout.
// teardown() says goodbye to the old camera with the old session and waits only briefly for it, so
// that request can still be in flight when the new connection installs a session of its own.
describe('a late answer belonging to a connection that is gone', () => {
	it('does not block the connection that replaced it', async () => {
		const server = camera({ scheme: 'basic' })
		const port = await server.listen()
		const self = instance(port, {})
		self.poll = true
		self.pollImage = true

		const departed = createAuthSession({}) // the old connection's session, with no login to offer
		const current = self.auth

		await self.httpGet(`http://127.0.0.1:${port}/cgi-bin/aw_cam?cmd=QID&res=1`, { auth: departed }).catch(() => {})

		// Nothing of the refusal reaches the connection that is running now — not its session, not its
		// loops, not its status, and not its log. The session that met it is on its way out anyway.
		expect(current.blocked).toBe(false)
		expect(self.poll).toBe(true)
		expect(self.pollImage).toBe(true)
		expect(self.updateStatus).not.toHaveBeenCalled()
		expect(self.log.mock.calls.filter(([level]) => level === 'error')).toHaveLength(0)
		await server.close()
	})
})

describe('the one-shot status list', () => {
	// Transport order is ptz, then cam, then web — so a fixture with both shows where it stopped.
	const listing = (sent, onSend) => {
		const self = {
			auth: {},
			reconnecting: false,
			SERIES: { capabilities: { pull: { ptz: ['#O'], cam: ['QID', 'QAF'] }, poll: { cam: ['QSD:4F'] } } },
			stopped: () => self.reconnecting,
		}

		const send = async (cmd) => {
			sent.push(cmd)
			onSend?.(self)
		}

		self.getCam = send
		self.getPTZ = send

		return self
	}

	it('stops where the camera dropped instead of running the list out', async () => {
		const sent = []

		// What scheduleReInit does, from inside the getter that swallowed the error.
		await getCameraStatusOnce(
			listing(sent, (self) => (self.reconnecting = true)),
			0,
		)

		expect(sent).toEqual(['#O'])
	})

	it('stops on a refused login too', async () => {
		const sent = []

		await getCameraStatusOnce(
			listing(sent, (self) => (self.auth.blocked = true)),
			0,
		)

		expect(sent).toEqual(['#O'])
	})

	it('runs the whole list while nothing is wrong', async () => {
		const sent = []

		await getCameraStatusOnce(listing(sent), 0)

		expect(sent).toEqual(['#O', 'QID', 'QAF', 'QSD:4F'])
	})
})
