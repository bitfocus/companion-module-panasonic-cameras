import { describe, expect, it } from 'vitest'
import { extractUpdates, MAX_BUFFER } from '../framing.js'

// A TCP stream has no message boundaries: notifications arrive coalesced (a burst) or split across
// chunks, so extractUpdates must reassemble by length prefix rather than per-chunk.

// Frame layout per Interface Specifications §4.2:
//   [Reserve 22][Size 2][Reserve 4][ CRLF command CRLF ][Reserve 24]
// with Size = information length + 8. The cameras zero-pad the information field to a multiple of four
// and count the padding in Size, so that is what this helper builds unless a test says otherwise.
function frame(command, { bigEndian = true, size, pad = true } = {}) {
	const command_ = Buffer.concat([Buffer.from('\r\n'), Buffer.from(command, 'latin1'), Buffer.from('\r\n')])
	const padding = pad ? (4 - (command_.length % 4)) % 4 : 0
	const info = Buffer.concat([command_, Buffer.alloc(padding)])

	const header = Buffer.alloc(28, 0x01)
	const declared = size ?? info.length + 8
	if (bigEndian) header.writeUInt16BE(declared, 22)
	else header.writeUInt16LE(declared, 22)

	return Buffer.concat([header, info, Buffer.alloc(24, 0x02)])
}

// Mirrors the socket handler: keep the leftover, prepend it to whatever arrives next.
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

// Cut a buffer into fixed-size pieces, standing in for arbitrary TCP delivery.
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
		// The coalescing case: the old handler took the first and dropped the rest.
		const burst = Buffer.concat([frame('TLR:1'), frame('OAF:1'), frame('OBR:0')])

		expect(feed([burst]).seen).toEqual(['TLR:1', 'OAF:1', 'OBR:0'])
	})

	it('waits for a notification that has only half arrived', () => {
		// The split case: the old handler parsed the half it had, 'OBR:' with no value.
		const f = frame('OBR:1')

		expect(feed([f.subarray(0, 34)]).seen).toEqual([])
		expect(feed([f.subarray(0, 34), f.subarray(34)]).seen).toEqual(['OBR:1'])
	})

	// The invariant: the result must not depend on chunk boundaries at all.
	it.each([1, 2, 3, 7, 13, 29, 31, 56, 64, 4096])('reads the same stream the same way, in chunks of %i', (size) => {
		const stream = Buffer.concat([frame('TLR:1'), frame('OAF:1'), frame('OSJ:0F:123'), frame('OBR:0')])

		const { seen, desynced } = feed(slice(stream, size))

		expect(seen).toEqual(['TLR:1', 'OAF:1', 'OSJ:0F:123', 'OBR:0'])
		expect(desynced).toBe(false)
	})

	// Real bytes off an AW-UE80. The spec gives Size's width but not its byte order; this capture settles it.
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
				// The "Reserve" bytes carry the camera's address and clock; decoded for the debug log only.
				source: 'from 192.168.11.41:12478, camera time: 26-07-14 22:03:10, unknown 00 01 00 80 00 00 00 00 00 01',
			},
		])
	})

	// Real bytes off an AW-UE150. Here the whole information field is visible, padding included, and it
	// settles that Size counts the padding: 'OAW:0' is 9 information bytes but Size declares 12.
	it('reads a padded frame captured from a real camera', () => {
		const captured = Buffer.from(
			'c0a814a7040b1a080a0c2c1200010080000000000001' + // 192.168.20.167, port, 26-08-10 12:44:18
				'0014' + // Size = 20 big-endian → information length 12, for a five-character command
				'01000000' + // Reserve(4)
				'0d0a' +
				Buffer.from('OAW:0').toString('hex') +
				'0d0a' + // the command, ending well before the declared 12 bytes
				'000000' + // and zero-padded to the next multiple of four
				'00'.repeat(24), // Reserve(24)
			'hex',
		)

		expect(extractUpdates(captured).updates.map((u) => u.command)).toEqual(['OAW:0'])
	})

	// What the UE150 test tripped over: every command whose length is not a multiple of four gets padded,
	// and reading the closing CRLF off Size instead of finding it dropped all of them. lPC1 and lPI…, being
	// multiples of four, came through — which is why the stream looked half-working rather than broken.
	it.each([
		['OSI:20:007DF:0', 'colour temperature'],
		['OAW:0', 'white balance mode'],
		['OSG:39:800', 'R gain'],
		['OSJ:4A:00C80:0', 'iris'],
		['lPC1', 'a length that needs no padding'],
		['lPI559A06FE5', 'another that needs none'],
	])('reads %s (%s)', (command) => {
		expect(feed([frame(command)]).seen).toEqual([command])
	})

	it('reads a padded frame the same way however the chunks fall', () => {
		const stream = Buffer.concat([frame('OAW:0'), frame('OSI:20:007DF:0'), frame('OSG:39:800')])

		for (const size of [1, 3, 13, 64, 4096]) {
			expect(feed(slice(stream, size)).seen).toEqual(['OAW:0', 'OSI:20:007DF:0', 'OSG:39:800'])
		}
	})

	it('still refuses a frame whose CRLF is further off than padding could explain', () => {
		// Finding the CRLF must not turn into hunting for one: four bytes past the command is no longer
		// padding, so this is not the frame we take it for and reading on would lose the stream.
		// A second frame follows only so the first one's declared length is available to be checked.
		const overstated = Buffer.concat([frame('TLR:1', { size: 24 }), frame('OAF:1')]) // 12 bytes declared as 16
		const { seen, desynced } = feed([overstated])

		expect(seen).toEqual([])
		expect(desynced).toBe(true)
	})

	it('refuses an information field with no closing CRLF at all', () => {
		const f = frame('TLR:1') // [Reserve 28] CRLF 'TLR:1' CRLF [pad 3] [Reserve 24]
		f[35] = 0x00 // the CR of the closing CRLF, at 28 + 2 + 5
		f[36] = 0x00

		expect(feed([f]).desynced).toBe(true)
	})

	it('reads Size big-endian, as the camera writes it', () => {
		const stream = Buffer.concat([frame('TLR:1'), frame('OSJ:0F:123')])

		expect(feed([stream]).seen).toEqual(['TLR:1', 'OSJ:0F:123'])
	})

	it('refuses a stream whose Size reads the other way round, instead of inventing a command', () => {
		// A little-endian frame must desync with the raw bytes, not parse into a plausible-looking command.
		const { seen, desynced } = feed([frame('TLR:1', { bigEndian: false })])

		expect(seen).toEqual([])
		expect(desynced).toBe(true)
	})

	it('hands back the unfinished tail rather than eating it', () => {
		const { seen, leftover } = feed([Buffer.concat([frame('TLR:1'), frame('OAF:1').subarray(0, 20)])])

		expect(seen).toEqual(['TLR:1'])
		expect(leftover.length).toBe(20)
	})

	it('is not fooled by a CRLF that falls inside the reserved bytes', () => {
		// The length prefix beats hunting for CRLF pairs: the reserved bytes carry IP and timestamp, which
		// can themselves contain 0d 0a (e.g. address 192.168.13.10, or the 13th at 10:xx).
		const f = frame('TLR:1')
		f[2] = 0x0d
		f[3] = 0x0a
		f[8] = 0x0d
		f[9] = 0x0a

		expect(feed([f]).seen).toEqual(['TLR:1'])
	})

	it('reports a stream it cannot frame, rather than guessing at it', () => {
		// A Size no valid frame could carry: reading on would parse the next chunk from a lost position.
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
		// The handler discards the buffer past this, or a peer that never completes a frame grows it unbounded.
		expect(MAX_BUFFER).toBeGreaterThan(504 + 52) // one whole frame at the spec's maximum, at least
		expect(MAX_BUFFER).toBeLessThanOrEqual(1024 * 1024)
	})
})
