import { describe, expect, it, vi } from 'vitest'
import {
	adoptChallenge,
	authHeaders,
	buildBasicAuthorization,
	buildDigestAuthorization,
	chooseChallenge,
	createAuthSession,
	parseAuthChallenges,
	requestWithAuth,
} from '../auth.js'

// The one an AW-HE40 with Auth. method "Digest" actually sends. No algorithm (so MD5), no opaque.
const PANASONIC = 'Digest realm="Control", nonce="297e52044f74f74526906c6679da24bd", qop="auth"'

const digest = (header) => chooseChallenge(parseAuthChallenges(header))

describe('parseAuthChallenges', () => {
	it('reads the challenge a Panasonic camera sends', () => {
		expect(parseAuthChallenges(PANASONIC)).toEqual([
			{
				scheme: 'digest',
				params: { realm: 'Control', nonce: '297e52044f74f74526906c6679da24bd', qop: 'auth' },
			},
		])
	})

	it('reads a Basic challenge', () => {
		expect(parseAuthChallenges('Basic realm="Control"')).toEqual([{ scheme: 'basic', params: { realm: 'Control' } }])
	})

	// The separator between two challenges is the same comma that separates one challenge's
	// parameters, so split(',') cannot tell them apart.
	it('splits two challenges that share a header', () => {
		const parsed = parseAuthChallenges('Digest realm="x", nonce="y", Basic realm="z"')

		expect(parsed).toEqual([
			{ scheme: 'digest', params: { realm: 'x', nonce: 'y' } },
			{ scheme: 'basic', params: { realm: 'z' } },
		])
	})

	it('keeps a comma that lives inside a quoted value', () => {
		expect(parseAuthChallenges('Digest realm="Studio A, Camera 2"')[0].params.realm).toBe('Studio A, Camera 2')
	})

	it('unescapes a quoted value without keeping the backslash', () => {
		expect(parseAuthChallenges('Digest realm="say \\"hi\\""')[0].params.realm).toBe('say "hi"')
	})

	// Nonces are frequently base64, which brings '=' and '+' into a value.
	it('keeps a base64 nonce whole', () => {
		const nonce = 'MTc2MzQ1Njc4OQ==+/x'
		expect(parseAuthChallenges(`Digest nonce="${nonce}"`)[0].params.nonce).toBe(nonce)
	})

	it('does not let a parameterless scheme swallow the next challenge', () => {
		const parsed = parseAuthChallenges('Negotiate, Digest realm="x"')

		expect(parsed.map((c) => c.scheme)).toEqual(['negotiate', 'digest'])
		expect(parsed[0].params).toEqual({})
		expect(parsed[1].params).toEqual({ realm: 'x' })
	})

	it('reads an unquoted parameter value', () => {
		expect(parseAuthChallenges('Digest realm="x", algorithm=MD5, stale=true')[0].params).toEqual({
			realm: 'x',
			algorithm: 'MD5',
			stale: 'true',
		})
	})

	it.each([undefined, null, '', 42])('hands back nothing for %o rather than throwing', (header) => {
		expect(parseAuthChallenges(header)).toEqual([])
	})
})

describe('chooseChallenge', () => {
	it('prefers Digest where a camera offers both', () => {
		expect(digest('Basic realm="x", Digest realm="x", nonce="y"').scheme).toBe('digest')
	})

	it('falls back to Basic when that is all there is', () => {
		expect(digest('Basic realm="x"').scheme).toBe('basic')
	})

	// Answering with a hash we cannot compute would look to the camera like a bad password, so an
	// algorithm we do not have has to leave the challenge unchosen and be reported instead.
	it('does not choose a Digest challenge it could not answer', () => {
		expect(digest('Digest realm="x", nonce="y", algorithm=RSA-1024')).toBeNull()
	})

	it('takes the Basic challenge beside a Digest one it cannot answer', () => {
		expect(digest('Digest realm="x", algorithm=RSA-1024, Basic realm="x"').scheme).toBe('basic')
	})

	it('hands back nothing for a header it cannot read', () => {
		expect(digest('Negotiate')).toBeNull()
	})
})

describe('buildBasicAuthorization', () => {
	it('base64s user and password', () => {
		expect(buildBasicAuthorization({ username: 'admin', password: '12345' })).toBe('Basic YWRtaW46MTIzNDU=')
	})
})

// Pinned against the specifications rather than against our own output: these vectors catch a wrong
// field order, a wrong uri and a quoting slip, which a self-referential test never would.
describe('buildDigestAuthorization', () => {
	const responseOf = (header) => /response="([0-9a-f]+)"/.exec(header)[1]

	// RFC 7616 §3.9.1
	it('matches the RFC 7616 MD5 vector', () => {
		const challenge = digest(
			'Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=MD5, ' +
				'nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", ' +
				'opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
		)

		const header = buildDigestAuthorization(challenge, {
			username: 'Mufasa',
			password: 'Circle of Life',
			method: 'GET',
			uri: '/dir/index.html',
			nc: 1,
			cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
		})

		expect(responseOf(header)).toBe('8ca523f5e9506fed4657c9700eebdbec')
	})

	it('matches the RFC 7616 SHA-256 vector', () => {
		const challenge = digest(
			'Digest realm="http-auth@example.org", qop="auth, auth-int", algorithm=SHA-256, ' +
				'nonce="7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v", ' +
				'opaque="FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS"',
		)

		const header = buildDigestAuthorization(challenge, {
			username: 'Mufasa',
			password: 'Circle of Life',
			method: 'GET',
			uri: '/dir/index.html',
			nc: 1,
			cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
		})

		expect(responseOf(header)).toBe('753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1')
	})

	// RFC 2617 §3.5
	it('matches the RFC 2617 vector', () => {
		const challenge = digest(
			'Digest realm="testrealm@host.com", qop="auth,auth-int", ' +
				'nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
		)

		const header = buildDigestAuthorization(challenge, {
			username: 'Mufasa',
			password: 'Circle Of Life',
			method: 'GET',
			uri: '/dir/index.html',
			nc: 1,
			cnonce: '0a4f113b',
		})

		expect(responseOf(header)).toBe('6629fae49393a05397450978507c4ef1')
	})

	// The camera command lives in the query, so hashing the path alone — or a decoded one — yields a
	// response the camera refuses for ever. Verified against a real AW-HE40.
	it('hashes the request target including its still-encoded query', () => {
		const url = new URL('http://10.0.0.1/cgi-bin/aw_ptz?cmd=%23O&res=1')
		const uri = url.pathname + url.search

		expect(uri).toBe('/cgi-bin/aw_ptz?cmd=%23O&res=1')

		const header = buildDigestAuthorization(digest(PANASONIC), {
			username: 'admin',
			password: '12345',
			method: 'GET',
			uri,
			nc: 1,
			cnonce: '0a4f113b',
		})

		expect(header).toContain('uri="/cgi-bin/aw_ptz?cmd=%23O&res=1"')
		// The same credentials against the path alone must not produce the same response.
		const bare = buildDigestAuthorization(digest(PANASONIC), {
			username: 'admin',
			password: '12345',
			method: 'GET',
			uri: '/cgi-bin/aw_ptz',
			nc: 1,
			cnonce: '0a4f113b',
		})
		expect(responseOf(header)).not.toBe(responseOf(bare))
	})

	// A server rejects a quoted nc or an unquoted nonce, so the quoting is part of the contract.
	it('quotes the values that must be quoted and leaves the others bare', () => {
		const header = buildDigestAuthorization(digest('Digest realm="r", nonce="n", qop="auth", algorithm=MD5'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 7,
			cnonce: 'c',
		})

		expect(header).toContain('algorithm=MD5')
		expect(header).toContain('qop=auth')
		expect(header).toContain('nc=00000007')
		expect(header).toMatch(/username="u"/)
		expect(header).toMatch(/nonce="n"/)
		expect(header).toMatch(/cnonce="c"/)
		expect(header).not.toMatch(/nc="/)
	})

	it('echoes opaque only when the challenge carried one', () => {
		const withOpaque = buildDigestAuthorization(digest('Digest realm="r", nonce="n", opaque="o"'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})
		const without = buildDigestAuthorization(digest('Digest realm="r", nonce="n"'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})

		expect(withOpaque).toContain('opaque="o"')
		expect(without).not.toContain('opaque')
	})

	// The Panasonic challenge carries no algorithm, and echoing one it never sent is a difference the
	// camera can see.
	it('omits algorithm when the challenge named none', () => {
		const header = buildDigestAuthorization(digest(PANASONIC), {
			username: 'admin',
			password: '12345',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})

		expect(header).not.toContain('algorithm')
	})

	it('folds the nonces into the session key for a -sess algorithm', () => {
		const plain = buildDigestAuthorization(digest('Digest realm="r", nonce="n", algorithm=MD5'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})
		const sess = buildDigestAuthorization(digest('Digest realm="r", nonce="n", algorithm=MD5-sess'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})

		expect(responseOf(sess)).not.toBe(responseOf(plain))
	})

	// A camera that offers no qop wants the older, shorter hash — and no nc or cnonce echoed back.
	it('uses the RFC 2069 form when the challenge offers no qop', () => {
		const header = buildDigestAuthorization(digest('Digest realm="r", nonce="n"'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})

		expect(header).not.toContain('qop')
		expect(header).not.toContain('nc=')
		expect(header).not.toContain('cnonce')
	})

	it('answers auth from an "auth,auth-int" list, never auth-int', () => {
		const header = buildDigestAuthorization(digest('Digest realm="r", nonce="n", qop="auth,auth-int"'), {
			username: 'u',
			password: 'p',
			method: 'GET',
			uri: '/x',
			nc: 1,
			cnonce: 'c',
		})

		expect(header).toContain('qop=auth,')
	})

	it('hands back nothing rather than a wrongly hashed answer', () => {
		const header = buildDigestAuthorization(
			{ scheme: 'digest', params: { algorithm: 'RSA-1024' } },
			{
				username: 'u',
				password: 'p',
				method: 'GET',
				uri: '/x',
				nc: 1,
				cnonce: 'c',
			},
		)

		expect(header).toBeNull()
	})
})

describe('authHeaders', () => {
	const session = (challengeHeader) => {
		const s = createAuthSession({ username: 'admin', password: '12345' })
		if (challengeHeader) adoptChallenge(s, digest(challengeHeader), () => 'fixedcnonce')
		return s
	}

	it('sends nothing before the camera has asked', () => {
		expect(authHeaders(createAuthSession({ username: 'admin', password: '12345' }), { uri: '/x' })).toEqual({})
	})

	it('sends nothing when no credentials are configured', () => {
		const s = createAuthSession()
		adoptChallenge(s, digest(PANASONIC), () => 'fixedcnonce')

		expect(authHeaders(s, { uri: '/x' })).toEqual({})
	})

	it('counts one request per header, eight digits wide', () => {
		const s = session(PANASONIC)

		expect(authHeaders(s, { uri: '/x' }).authorization).toContain('nc=00000001')
		expect(authHeaders(s, { uri: '/x' }).authorization).toContain('nc=00000002')
		expect(authHeaders(s, { uri: '/x' }).authorization).toContain('nc=00000003')
	})

	// nc counts requests against one nonce. Carrying a count across nonces would offer the camera a
	// pair it has already seen, which is a replay to it.
	it('restarts the count when a new nonce is adopted', () => {
		const s = session(PANASONIC)
		authHeaders(s, { uri: '/x' })
		authHeaders(s, { uri: '/x' })

		adoptChallenge(s, digest('Digest realm="Control", nonce="other", qop="auth"'), () => 'fixedcnonce')

		expect(authHeaders(s, { uri: '/x' }).authorization).toContain('nc=00000001')
	})

	it('repeats the same Basic header without a counter', () => {
		const s = session('Basic realm="Control"')

		expect(authHeaders(s, { uri: '/x' })).toEqual({ authorization: 'Basic YWRtaW46MTIzNDU=' })
		expect(authHeaders(s, { uri: '/y' })).toEqual({ authorization: 'Basic YWRtaW46MTIzNDU=' })
	})
})

// The retry-once bound is the safety property: at ~20 requests a second, an auth layer that kept
// trying would be a request storm against a camera that is already refusing.
describe('requestWithAuth', () => {
	const unauthorized = (header = PANASONIC) =>
		Object.assign(new Error('401'), {
			code: 'ERR_NON_2XX_3XX_RESPONSE',
			response: { statusCode: 401, headers: header ? { 'www-authenticate': header } : {} },
		})

	const credentials = () => createAuthSession({ username: 'admin', password: '12345' })

	it('sends once and settles on nothing when the camera never asks', async () => {
		const send = vi.fn(async () => 'ok')
		const session = credentials()

		expect(await requestWithAuth(send, { session, uri: '/x' })).toBe('ok')
		expect(send).toHaveBeenCalledTimes(1)
		expect(send.mock.calls[0][0]).toEqual({})
		expect(session.scheme).toBe('none')
	})

	it('answers a challenge and retries exactly once', async () => {
		const send = vi.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce('ok')
		const session = credentials()

		expect(await requestWithAuth(send, { session, uri: '/x' })).toBe('ok')
		expect(send).toHaveBeenCalledTimes(2)
		expect(send.mock.calls[1][0].authorization).toMatch(/^Digest /)
		expect(session.scheme).toBe('digest')
	})

	// The invariant. A camera saying no for ever must cost two requests, not a stream of them.
	it('gives up after one retry when the password is simply wrong', async () => {
		const send = vi.fn().mockRejectedValue(unauthorized())
		const session = credentials()
		const report = vi.fn()

		await expect(requestWithAuth(send, { session, uri: '/x', report })).rejects.toThrow()
		expect(send).toHaveBeenCalledTimes(2)
		expect(report).toHaveBeenCalledWith(expect.objectContaining({ type: 'rejected', realm: 'Control' }))
	})

	it('does not retry, or ask, when no credentials are configured', async () => {
		const send = vi.fn().mockRejectedValue(unauthorized())
		const report = vi.fn()

		await expect(requestWithAuth(send, { session: createAuthSession(), uri: '/x', report })).rejects.toThrow()
		expect(send).toHaveBeenCalledTimes(1)
		expect(report).toHaveBeenCalledWith(expect.objectContaining({ type: 'credentialsRequired' }))
	})

	// A fresh nonce with the same credentials is not a refusal. It arrives on a later request, once
	// the nonce the connection has been using ages out, and must not be read as a bad password.
	it('re-handshakes on a stale nonce rather than calling it a rejection', async () => {
		const session = credentials()
		const report = vi.fn()

		// The connection learns the scheme on its first request.
		const learn = vi.fn().mockRejectedValueOnce(unauthorized()).mockResolvedValueOnce('ok')
		await requestWithAuth(learn, { session, uri: '/x', report })
		expect(session.scheme).toBe('digest')

		// A later request carries the header up front, and the camera says the nonce has aged out.
		const stale = unauthorized('Digest realm="Control", nonce="fresh", qop="auth", stale=true')
		const send = vi.fn().mockRejectedValueOnce(stale).mockResolvedValueOnce('ok')
		report.mockClear()

		expect(await requestWithAuth(send, { session, uri: '/x', report })).toBe('ok')
		expect(send).toHaveBeenCalledTimes(2)
		expect(report).toHaveBeenCalledWith(expect.objectContaining({ type: 'stale', realm: 'Control' }))
		expect(report).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'rejected' }))

		// The new nonce starts its own count, and the retry was its first request.
		expect(send.mock.calls[1][0].authorization).toContain('nc=00000001')
		expect(send.mock.calls[1][0].authorization).toContain('nonce="fresh"')
	})

	it('reports a scheme it cannot answer instead of guessing at one', async () => {
		const send = vi.fn().mockRejectedValue(unauthorized('Digest realm="x", nonce="y", algorithm=RSA-1024'))
		const report = vi.fn()

		await expect(requestWithAuth(send, { session: credentials(), uri: '/x', report })).rejects.toThrow()
		expect(report).toHaveBeenCalledWith(expect.objectContaining({ type: 'unsupported' }))
	})

	it.each(['ERR_ABORTED', 'ETIMEDOUT', 'ECONNRESET'])('rethrows a %s untouched', async (code) => {
		const error = Object.assign(new Error(code), { code })
		const send = vi.fn().mockRejectedValue(error)

		await expect(requestWithAuth(send, { session: credentials(), uri: '/x' })).rejects.toBe(error)
		expect(send).toHaveBeenCalledTimes(1)
	})

	it('passes straight through when the connection has no session', async () => {
		const send = vi.fn(async () => 'ok')

		expect(await requestWithAuth(send, { session: null, uri: '/x' })).toBe('ok')
		expect(send).toHaveBeenCalledTimes(1)
	})
})
