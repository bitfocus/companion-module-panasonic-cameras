// The camera's update notifications arrive over a TCP stream, and a stream has no messages in it —
// only bytes. The chunks a socket hands us are whatever the network happened to deliver: two
// notifications may arrive in one chunk, and one may arrive split across two. The handler used to
// assume neither ever happened, and when the camera pushes a burst — a preset recall, a tally cut, the
// lens position stream #LPC1 turns on — both do. A coalesced pair silently lost its second half; a
// split one wrote a truncated command into the camera state.
//
// So the notifications are cut out of the accumulated bytes rather than out of a chunk.
//
// The frame is the one in the Interface Specifications, §4.2 "Data format for update notifications":
//
//     [Reserve 22][Size 2][Reserve 4][ Update notification information ][Reserve 24]
//
// where the information field is `[CR][LF] <command> [CR][LF]`, at most 504 bytes, and — this is the
// part that matters — its length is carried in `Size`: "the value obtained by subtracting 8 bytes from
// the Size area setting". The stream is therefore length-prefixed, and the frames are read rather than
// searched for.
//
// Searching for the CRLF pairs instead is the obvious alternative, and it is wrong. The "reserved"
// bytes are not reserved at all; a frame off a real AW-UE80 begins:
//
//     c0 a8 0b 29  30 be  1a 07 0e 16 03 0a  …  00 10  01 00 00 00  0d 0a  6c 50 43 31  0d 0a
//     └ 192.168.11.41 ┘  └port┘ └ 26-07-14 22:03:10 ┘  └Size┘        └CRLF┘ └  lPC1  ┘ └CRLF┘
//
// — the camera's own address and a timestamp. So a camera at x.x.13.10 carries 0d 0a in its header,
// and so does every frame sent on the 13th of a month during the 10 o'clock hour. A CRLF hunt would
// have quietly desynchronised, roughly an hour a month, on hardware nobody would think to test.
//
// The spec gives the width of `Size` but not its byte order. That same frame settles it: 00 10 reads
// as 16 big-endian, giving an information length of 8 and a four-character command — which `lPC1`, the
// camera's answer to the #LPC1 sent at subscribe time, exactly is. Little-endian would make it 4096.
// The IP address above, in network byte order, says the same about the header as a whole.

const HEADER = 28 // Reserve(22) + Size(2) + Reserve(4)
const SIZE_AT = 22
const TRAILER = 24
const MAX_INFO = 504 // the spec's ceiling on the information field

// The information field is CRLF + command + CRLF, so anything shorter than the two CRLFs is not one.
const MIN_INFO = 4

// The most that may sit in a socket's buffer before we conclude the stream is not what we take it for.
// A peer that never completes a frame would otherwise grow it without limit.
export const MAX_BUFFER = 64 * 1024

const CR = 0x0d
const LF = 0x0a

// What the 22 bytes the specification calls "Reserve" turn out to carry. This is read off captured
// frames, not out of any document, so it is debug output and nothing else: no decision is made on it,
// and a model that fills these bytes differently costs a confusing log line and nothing more.
//
// From a real AW-UE80:  c0 a8 0b 29 | 30 be | 1a 07 0e 16 03 0a | 00 01 00 80 00 00 00 00 00 01
//                       192.168.11.41  12478   26-07-14 22:03:10   still unaccounted for
//
// The timestamp is the camera's own clock, which is not necessarily Companion's — on the frame above
// the two were an hour apart. The last ten bytes are dumped raw in the hope that a pattern shows up
// across models; they are the reason this returns a string rather than pretending to a structure.
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
	if (available < HEADER) return { incomplete: true } // the size is not even here yet

	const infoLen = buffer.readUInt16BE(pos + SIZE_AT) - 8 // §4.2: information length = Size - 8
	if (infoLen < MIN_INFO || infoLen > MAX_INFO) return { desync: true } // not a length this format can produce

	const length = HEADER + infoLen + TRAILER
	if (available < length) return { incomplete: true }

	const info = pos + HEADER
	const endOfCommand = info + infoLen - 2

	// The delimiters confirm the reading. A stream that is not the one we think it is does not happen to
	// put a CRLF at both ends of the field it claims, so this is what turns a misread into an honest
	// "out of sync" rather than a command invented out of noise.
	const framed =
		buffer[info] === CR && buffer[info + 1] === LF && buffer[endOfCommand] === CR && buffer[endOfCommand + 1] === LF

	if (!framed) return { desync: true }

	return {
		command: buffer.toString('latin1', info + 2, endOfCommand),
		source: describeSource(buffer, pos),
		length,
	}
}

// Every complete notification in `buffer` as `{ command, source }` — the command the camera sent, and
// what its header says about where and when it sent it — plus the bytes left over, an unfinished frame
// at the end which belongs at the front of whatever arrives next.
//
// `desync` says the bytes are not the frames this knows how to read, and the caller should throw the
// buffer away rather than go on reading a stream it has lost its place in.
export function extractUpdates(buffer) {
	const updates = []
	let pos = 0

	for (;;) {
		const frame = readFrame(buffer, pos)

		if (frame.desync) return { updates, rest: buffer.subarray(pos), desync: true }
		if (frame.incomplete) break

		// An empty command is a well-formed frame carrying nothing. Skip it; do not hand the parser a
		// blank to write into the state.
		if (frame.command) updates.push({ command: frame.command, source: frame.source })
		pos += frame.length
	}

	return { updates, rest: buffer.subarray(pos), desync: false }
}
