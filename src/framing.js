// Update notifications arrive over TCP (a byte stream), so frames are cut from accumulated bytes, not per-chunk.
// Frame per Interface Spec §4.2: [Reserve 22][Size 2][Reserve 4][info][Reserve 24]; info = [CR][LF]<command>[CR][LF], <=504 bytes.
// Length-prefixed: info length = Size - 8. Size is big-endian. Do not CRLF-hunt: the "reserved" header bytes (IP, timestamp) can contain CR/LF.

const HEADER = 28 // Reserve(22) + Size(2) + Reserve(4)
const SIZE_AT = 22
const TRAILER = 24
const MAX_INFO = 504 // spec ceiling

// CRLF + command + CRLF, so shorter than two CRLFs is invalid.
const MIN_INFO = 4

// cap buffered bytes; a peer that never completes a frame would grow it without limit
export const MAX_BUFFER = 64 * 1024

const CR = 0x0d
const LF = 0x0a

// The 22 "Reserve" bytes, read off captured frames (debug only, no decision made on them):
// IP(4) port(2) timestamp(6) + 10 unaccounted bytes. Timestamp is the camera's own clock, not Companion's.
const pad = (n) => String(n).padStart(2, '0')

function describeSource(buffer, pos) {
	const ip = [...buffer.subarray(pos, pos + 4)].join('.')
	const port = buffer.readUInt16BE(pos + 4)
	const [yy, mm, dd, hh, mi, ss] = buffer.subarray(pos + 6, pos + 12)
	const unknown = buffer
		.subarray(pos + 12, pos + 22)
		.toString('hex')
		.replace(/(..)/g, '$1 ')
		.trim()

	return (
		`from ${ip}:${port}` +
		`, camera time: ${pad(yy)}-${pad(mm)}-${pad(dd)} ${pad(hh)}:${pad(mi)}:${pad(ss)}` +
		`, unknown ${unknown}`
	)
}

// The frame at `pos`, or why it cannot be read yet.
function readFrame(buffer, pos) {
	const available = buffer.length - pos
	if (available < HEADER) return { incomplete: true } // Size not here yet

	const infoLen = buffer.readUInt16BE(pos + SIZE_AT) - 8 // §4.2: information length = Size - 8
	if (infoLen < MIN_INFO || infoLen > MAX_INFO) return { desync: true } // not a length this format produces

	const length = HEADER + infoLen + TRAILER
	if (available < length) return { incomplete: true }

	const info = pos + HEADER
	const endOfCommand = info + infoLen - 2

	// CRLF at both ends confirms the read, turning a misread into an honest desync rather than command from noise.
	const framed =
		buffer[info] === CR && buffer[info + 1] === LF && buffer[endOfCommand] === CR && buffer[endOfCommand + 1] === LF

	if (!framed) return { desync: true }

	return {
		command: buffer.toString('latin1', info + 2, endOfCommand),
		source: describeSource(buffer, pos),
		length,
	}
}

// Returns every complete notification as { command, source }, plus leftover unfinished bytes for the next chunk.
// desync: bytes are not our frames; caller should discard the buffer.
export function extractUpdates(buffer) {
	const updates = []
	let pos = 0

	for (;;) {
		const frame = readFrame(buffer, pos)

		if (frame.desync) return { updates, rest: buffer.subarray(pos), desync: true }
		if (frame.incomplete) break

		// empty command: well-formed but carries nothing; skip so the parser gets no blank
		if (frame.command) updates.push({ command: frame.command, source: frame.source })
		pos += frame.length
	}

	return { updates, rest: buffer.subarray(pos), desync: false }
}
