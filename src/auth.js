import { createHash, getHashes, randomBytes } from 'node:crypto'

// HTTP authentication for cameras whose "User auth." is switched on. Everything the module sends
// routinely is at the camera's Live level, which needs no login until that setting is enabled; the
// one Admin-level command (initial?cmd=reset) always did and carries its own credentials.
//
// The camera decides the scheme, not the user: its Auth. method setting offers "Digest or Basic",
// "Digest" and "Basic", and the first of those is the factory default — so there is no answer a
// config field could hold that the challenge does not already give us. Measured on an AW-HE40:
//
//   Digest: WWW-Authenticate: Digest realm="Control", nonce="<32 hex>", qop="auth"
//   Basic:  WWW-Authenticate: Basic realm="Control"
//
// got does Basic natively but has no Digest at all, so the header is built here for both — one code
// path, and credentials never reach got's URL object (which is what its username/password options
// write into, and what would then travel in anything that prints a URL).

// Which hashes this Node build can actually compute. An algorithm we cannot answer has to be
// reported as such: sending a response hashed the wrong way looks to the camera like a bad password.
const HASHES = {
	MD5: 'md5',
	'MD5-SESS': 'md5',
	'SHA-256': 'sha256',
	'SHA-256-SESS': 'sha256',
	'SHA-512-256': 'sha512-256',
	'SHA-512-256-SESS': 'sha512-256',
}

// Which of those this OpenSSL build actually carries — sha512-256 is missing from some. Resolved on
// first use rather than at import, so nothing runs while the module is merely being loaded.
let available

const hashFor = (algorithm = 'MD5') => {
	const node = HASHES[String(algorithm).toUpperCase()]
	if (!node) return null

	available ??= new Set(getHashes())
	return available.has(node) ? node : null
}

// A WWW-Authenticate value can carry several challenges, and they are separated by the same comma
// that separates one challenge's parameters — "Digest realm=\"x\", nonce=\"y\", Basic realm=\"x\"".
// So a split(',') cannot work. Read tokens instead: a token followed by "=" is a parameter of the
// challenge in hand, a token that is not begins a new one.
export function parseAuthChallenges(header) {
	if (typeof header !== 'string') return []

	const challenges = []
	let i = 0

	const skipSpace = () => {
		while (i < header.length && /[\s,]/.test(header[i])) i++
	}

	const readToken = () => {
		const start = i
		while (i < header.length && /[^\s,=]/.test(header[i])) i++
		return header.slice(start, i)
	}

	const readValue = () => {
		if (header[i] !== '"') return readToken()

		i++ // opening quote
		let out = ''
		while (i < header.length && header[i] !== '"') {
			// A quoted-string escapes with a backslash, which the value itself must not keep.
			if (header[i] === '\\' && i + 1 < header.length) i++
			out += header[i++]
		}
		i++ // closing quote
		return out
	}

	while (i < header.length) {
		skipSpace()
		const token = readToken()
		if (!token) break

		skipSpace()
		if (header[i] === '=') {
			// A parameter, so it belongs to the challenge already open. One with no challenge before
			// it is malformed; drop it rather than invent a scheme for it.
			i++
			const value = readValue()
			if (challenges.length) challenges[challenges.length - 1].params[token.toLowerCase()] = value
		} else {
			challenges.push({ scheme: token.toLowerCase(), params: {} })
		}
	}

	return challenges
}

// Digest before Basic wherever both are offered: it is the stronger of the two and the camera
// accepts either. A scheme we cannot answer is not chosen, so it can be reported as unsupported.
export function chooseChallenge(challenges) {
	const usable = challenges.filter(
		(c) => c.scheme === 'basic' || (c.scheme === 'digest' && hashFor(c.params.algorithm) !== null),
	)

	return usable.find((c) => c.scheme === 'digest') ?? usable.find((c) => c.scheme === 'basic') ?? null
}

export function buildBasicAuthorization({ username, password }) {
	return 'Basic ' + Buffer.from(`${username}:${password}`, 'utf8').toString('base64')
}

// RFC 7616. `uri` is the request-target as it goes on the wire — path *and* query, still
// percent-encoded. This module puts the camera command in the query ("aw_ptz?cmd=%23O&res=1"), so
// hashing a path alone, or a decoded one, yields a response the camera rejects for ever.
export function buildDigestAuthorization(challenge, { username, password, method, uri, nc, cnonce }) {
	const { realm = '', nonce = '', qop, opaque, algorithm } = challenge.params

	const node = hashFor(algorithm)
	if (!node) return null

	const H = (value) => createHash(node).update(value, 'utf8').digest('hex')
	const ncHex = nc.toString(16).padStart(8, '0')

	// -sess folds the nonces into HA1, so a session key differs per connection rather than being the
	// password hash for all time.
	const sess = /-sess$/i.test(algorithm ?? '')
	const secret = H(`${username}:${realm}:${password}`)
	const ha1 = sess ? H(`${secret}:${nonce}:${cnonce}`) : secret

	// qop may be a list ("auth,auth-int"). auth-int hashes the request body, and every request this
	// module makes is a GET without one, so only plain auth is ever offered back.
	const useQop = String(qop ?? '')
		.split(',')
		.map((v) => v.trim())
		.includes('auth')
		? 'auth'
		: null

	const ha2 = H(`${method}:${uri}`)
	const response = useQop ? H(`${ha1}:${nonce}:${ncHex}:${cnonce}:${useQop}:${ha2}`) : H(`${ha1}:${nonce}:${ha2}`) // the RFC 2069 form, for a camera that offers no qop

	// Quoting is not cosmetic: servers reject a quoted nc or an unquoted nonce. algorithm, qop and
	// nc go bare, everything else is a quoted-string.
	const parts = [
		`username="${username}"`,
		`realm="${realm}"`,
		`nonce="${nonce}"`,
		`uri="${uri}"`,
		`response="${response}"`,
	]

	if (algorithm) parts.push(`algorithm=${algorithm}`) // echoed only when the challenge named one
	if (useQop) parts.push(`qop=${useQop}`, `nc=${ncHex}`, `cnonce="${cnonce}"`)
	if (opaque !== undefined) parts.push(`opaque="${opaque}"`)

	return 'Digest ' + parts.join(', ')
}

// One session per connection. It holds the credentials and — once the camera has asked — the
// challenge to answer every later request with, so the handshake happens once rather than per
// request. At up to ~20 requests a second, re-handshaking would double the traffic.
export function createAuthSession({ username = '', password = '' } = {}) {
	return {
		username,
		password,
		hasCredentials: Boolean(username || password),
		scheme: 'unknown', // 'unknown' | 'none' | 'basic' | 'digest'

		// Set by the instance once a refusal has hit the connection itself rather than a single command,
		// which is a distinction only the caller can draw. Nothing clears it: a login only changes when
		// the connection is rebuilt, and that builds a new session.
		blocked: false,

		// Whether anything has ever got through on this session. It is what separates "this connection
		// cannot reach the camera" from "this camera served everything and then guarded one command".
		ok: false,
		challenge: null,
		cnonce: null,
		nc: 0,
	}
}

// Adopting a challenge replaces nonce, cnonce and counter together: nc counts requests against one
// nonce, and reusing a count the camera has seen is a replay to it.
export function adoptChallenge(session, challenge, makeCnonce = () => randomBytes(8).toString('hex')) {
	session.scheme = challenge.scheme
	session.challenge = challenge
	session.cnonce = makeCnonce()
	session.nc = 0
}

// Builds the header for one request. Synchronous on purpose, and the counter is taken in the same
// breath as the header is built: put an await between the two and concurrent requests — the poll
// loop, the image loop, a pressed button — would sign themselves with the same nc.
export function authHeaders(session, { method = 'GET', uri }) {
	if (!session?.hasCredentials || !session.challenge) return {}

	const { username, password } = session

	if (session.scheme === 'basic') return { authorization: buildBasicAuthorization({ username, password }) }

	session.nc += 1
	const authorization = buildDigestAuthorization(session.challenge, {
		username,
		password,
		method,
		uri,
		nc: session.nc,
		cnonce: session.cnonce,
	})

	return authorization ? { authorization } : {}
}

const isUnauthorized = (error) => error?.response?.statusCode === 401

// Sends one request, and answers a 401 by adopting the challenge and sending it again — once.
//
// The retry-once bound is the whole safety property. A camera that keeps saying no is answered by
// at most one extra request, never a stream of them; at ~20 requests a second an auth layer that
// retried on its own schedule would be a request storm against a device already refusing.
//
// `send` is a parameter so the policy can be exercised without got, a server or an instance.
export async function requestWithAuth(send, { session, method = 'GET', uri, report = () => {} } = {}) {
	if (!session) return send({})

	try {
		const response = await send(authHeaders(session, { method, uri }))

		// First answer of the connection, and the camera never asked: settle on sending nothing, so a
		// camera without User auth. costs nothing for the life of the connection. Worth reporting even
		// though nothing is wrong — it is the difference the panel shows between "no login is needed
		// here" and "nothing has been tried yet".
		if (session.scheme === 'unknown') {
			session.scheme = 'none'
			report({ type: 'none' })
		}

		session.ok = true
		return response
	} catch (error) {
		if (!isUnauthorized(error)) throw error

		const header = error.response?.headers?.['www-authenticate']
		const offered = header ? parseAuthChallenges(header) : []
		const challenge = chooseChallenge(offered)

		// Nothing to answer with is not the same as nothing being asked: an unreadable header means we
		// have no credentials to offer, while a header we cannot compute is a scheme worth naming.
		if (!session.hasCredentials) {
			report({ type: 'credentialsRequired', realm: challenge?.params?.realm, scheme: challenge?.scheme })
			throw error
		}

		if (offered.length && !challenge) {
			report({ type: 'unsupported', offered: offered.map((c) => c.scheme).join(', ') })
			throw error
		}

		// Already carrying a challenge and refused anyway: either the nonce aged out, or the password
		// is wrong. Only the first is worth another request.
		const stale = String(challenge?.params?.stale ?? '').toLowerCase() === 'true'

		if (session.challenge && !stale) {
			report({ type: 'rejected', realm: challenge?.params?.realm, scheme: session.scheme })
			throw error
		}

		if (challenge) {
			if (stale) report({ type: 'stale', realm: challenge.params.realm })
			adoptChallenge(session, challenge)
		} else {
			// Some firmware answers 401 with no challenge at all. Basic needs none, so it is worth the
			// single retry we allow ourselves.
			adoptChallenge(session, { scheme: 'basic', params: {} })
		}

		const headers = authHeaders(session, { method, uri })

		if (!headers.authorization) {
			report({ type: 'unsupported', offered: challenge?.scheme })
			throw error
		}

		try {
			const response = await send(headers)
			session.ok = true

			// Reported only once the retry has come back. Announcing the handshake before then names a
			// login as accepted while the camera is still free to refuse it — and it is free to: the
			// Admin level guards `initial?cmd=reset` on every model, including one whose "User auth." is
			// off and whose every other request needs no login at all.
			if (!stale) {
				report({
					type: 'authenticated',
					scheme: session.scheme,
					realm: challenge?.params?.realm,
					algorithm: challenge?.params?.algorithm,
				})
			}

			return response
		} catch (retryError) {
			// The one extra request is spent. A second refusal is reported here rather than left for the
			// next request to discover, so a wrong password is named the moment it is known.
			if (isUnauthorized(retryError)) {
				report({ type: 'rejected', realm: challenge?.params?.realm, scheme: session.scheme })
			}
			throw retryError
		}
	}
}
