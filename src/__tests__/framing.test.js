import { describe, expect, it } from 'vitest'
import { extractUpdates, MAX_BUFFER } from '../framing.js'

// The camera pushes its notifications down a TCP stream, and a stream has no messages in it. The
// handler used to read one message out of each chunk the socket delivered, which holds only as long as
// the network happens to deliver them one per chunk. It does not: a burst — a preset recall, a tally
// cut, the lens position stream #LPC1 turns on — arrives coalesced, and a message that straddles a
// segment boundary arrives split. The first lost every notification but the first; the second wrote a
// truncated command into the camera state.

// A notification, framed as the Interface Specifications §4.2 lays it out:
//   [Reserve 22][Size 2][Reserve 4][ CRLF command CRLF ][Reserve 24]
// with Size = information length + 8, and the information field being the CRLFs plus the command.
function frame(command, { bigEndian = true, size } = {}) {
	const info = Buffer.concat([Buffer.from('\r\n'), Buffer.from(command, 'latin1'), Buffer.from('\r\n')])

	const header = Buffer.alloc(28, 0x01)
	const declared = size ?? info.length + 8
	if (bigEndian) header.writeUInt16BE(declared, 22)
	else header.writeUInt16LE(declared, 22)

	return Buffer.concat([header, info, Buffer.alloc(24, 0x02)])
}

// What the socket handler does: keep the leftover, prepend it to whatever arrives next.
function feed(chunks) {
	let buffer = Buffer.alloc(0)
	const seen = []
	let desynced = false

	for (const chunk of chunks) {
		buffer = Buffer.concat([buffer, chunk])
		const { updates, rest, desync } = extractUpdates(buffer)
		seen.push(...updates.map((u) => u.command))
		buffer = rest
		if (desync) {
			desynced = true
			buffer = Buffer.alloc(0)
		}
	}

	return { seen, leftover: buffer, desynced }
}

// Cut a buffer into fixed-size pieces — a stand-in for every way TCP could have delivered it.
const slice = (buffer, size) => {
	const chunks = []
	for (let i = 0; i < buffer.length; i += size) chunks.push(buffer.subarray(i, i + size))
	return chunks
}

describe('extractUpdates', () => {
	it('reads a notification that arrives on its own', () => {
		expect(feed([frame('TLR:1')]).seen).toEqual(['TLR:1'])
	})

	it('reads the examples the specification itself gives', () => {
		// §4.2: "Power: On → [CR][LF]p1[CR][LF]" and "Color bar: On → [CR][LF]DCB:1[CR][LF]".
		expect(feed([frame('p1'), frame('DCB:1')]).seen).toEqual(['p1', 'DCB:1'])
	})

	it('reads every notification of a burst that arrives in one chunk', () => {
		// The coalescing case. The old handler took the first and silently dropped the rest — so a preset
		// recall, which changes pan, tilt, zoom, focus and iris at once, landed as a pan and nothing else.
		const burst = Buffer.concat([frame('TLR:1'), frame('OAF:1'), frame('OBR:0')])

		expect(feed([burst]).seen).toEqual(['TLR:1', 'OAF:1', 'OBR:0'])
	})

	it('waits for a notification that has only half arrived', () => {
		// The split case. The old handler parsed the half it had: 'OBR:' with no value, which the parser
		// duly wrote into the state.
		const f = frame('OBR:1')

		expect(feed([f.subarray(0, 34)]).seen).toEqual([]) // nothing beats half of something
		expect(feed([f.subarray(0, 34), f.subarray(34)]).seen).toEqual(['OBR:1'])
	})

	// The invariant that subsumes the two cases above: chunk boundaries are the network's business, and
	// the result must not depend on them at all.
	it.each([1, 2, 3, 7, 13, 29, 31, 56, 64, 4096])('reads the same stream the same way, in chunks of %i', (size) => {
		const stream = Buffer.concat([frame('TLR:1'), frame('OAF:1'), frame('OSJ:0F:123'), frame('OBR:0')])

		const { seen, desynced } = feed(slice(stream, size))

		expect(seen).toEqual(['TLR:1', 'OAF:1', 'OSJ:0F:123', 'OBR:0'])
		expect(desynced).toBe(false)
	})

	// Real bytes off an AW-UE80 — the frame it sends the moment the module subscribes, which is its
	// answer to the #LPC1 that turns the lens position stream on. The specification gives the width of
	// Size but not its byte order; this is what settles it, and it is worth keeping as the one test
	// case nobody made up.
	it('reads a frame captured from a real camera', () => {
		const captured = Buffer.from(
			'c0a80b2930be1a070e16030a00010080000000000001' + // 192.168.11.41, port, 26-07-14 22:03:10
				'0010' + // Size = 16 big-endian → information length 8 → a four-character command
				'01000000' + // Reserve(4)
				'0d0a' +
				Buffer.from('lPC1').toString('hex') +
				'0d0a' + // the information field
				'00'.repeat(24), // Reserve(24)
			'hex',
		)

		expect(extractUpdates(captured).updates).toEqual([
			{
				command: 'lPC1',
				// The bytes the specification calls "Reserve" are nothing of the sort. Decoded here only for
				// the debug log — nothing acts on them — and pinned against the one frame that proves the
				// reading: the address and the clock both match the camera the capture came from.
				source: 'from 192.168.11.41:12478, camera time: 26-07-14 22:03:10, unknown 00 01 00 80 00 00 00 00 00 01',
			},
		])
	})

	it('reads Size big-endian, as the camera writes it', () => {
		const stream = Buffer.concat([frame('TLR:1'), frame('OSJ:0F:123')])

		expect(feed([stream]).seen).toEqual(['TLR:1', 'OSJ:0F:123'])
	})

	it('refuses a stream whose Size reads the other way round, instead of inventing a command', () => {
		// If a model ever does frame its notifications little-endian, it says so as an out-of-sync error
		// carrying the raw bytes — not as a plausible-looking command parsed out of noise.
		const { seen, desynced } = feed([frame('TLR:1', { bigEndian: false })])

		expect(seen).toEqual([])
		expect(desynced).toBe(true)
	})

	it('hands back the unfinished tail rather than eating it', () => {
		const { seen, leftover } = feed([Buffer.concat([frame('TLR:1'), frame('OAF:1').subarray(0, 20)])])

		expect(seen).toEqual(['TLR:1'])
		expect(leftover.length).toBe(20) // the start of OAF:1 is still there, waiting for the rest
	})

	it('is not fooled by a CRLF that falls inside the reserved bytes', () => {
		// This is what the length prefix buys over hunting for CRLF pairs, and it is not hypothetical:
		// the "reserved" bytes carry the camera's own IP and a timestamp. A camera at 192.168.13.10 has
		// 0d 0a in its header, and so does every frame sent on the 13th of a month at 10 o'clock — a CRLF
		// hunt would have desynchronised for an hour a month, on hardware nobody would think to test.
		const f = frame('TLR:1')
		f[2] = 0x0d
		f[3] = 0x0a // as in the address 192.168.13.10
		f[8] = 0x0d
		f[9] = 0x0a // as in a timestamp on the 13th at 10:xx

		expect(feed([f]).seen).toEqual(['TLR:1'])
	})

	it('reports a stream it cannot frame, rather than guessing at it', () => {
		// A Size that no valid frame could carry. Reading on would mean reading the next chunk against a
		// stream we have already lost our place in.
		const { seen, desynced } = feed([frame('TLR:1', { size: 9999 })])

		expect(seen).toEqual([])
		expect(desynced).toBe(true)
	})

	it('skips a well-formed frame that carries no command', () => {
		expect(feed([Buffer.concat([frame(''), frame('TLR:1')])]).seen).toEqual(['TLR:1'])
	})

	it('leaves nothing behind for an empty buffer', () => {
		const { updates, rest, desync } = extractUpdates(Buffer.alloc(0))

		expect(updates).toEqual([])
		expect(rest.length).toBe(0)
		expect(desync).toBe(false)
	})

	it('bounds what a socket may accumulate', () => {
		// The handler discards the buffer past this. A peer that never completes a frame would otherwise
		// grow it until the process died.
		expect(MAX_BUFFER).toBeGreaterThan(504 + 52) // one whole frame at the spec's maximum, at least
		expect(MAX_BUFFER).toBeLessThanOrEqual(1024 * 1024)
	})
})
