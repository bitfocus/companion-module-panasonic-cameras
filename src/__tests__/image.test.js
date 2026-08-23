import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Jimp } from 'jimp'
import { IMAGE_SIZE, fitImage } from '../common.js'
import { startLiveImagePoll } from '../polling.js'

// A 16:9 frame, the shape every camera answers with.
const frame = () => new Jimp({ width: 1920, height: 1080, color: 0x3366ccff })

describe('bounding a camera frame for a button', () => {
	it('scales a frame down to what a button can show, whole', () => {
		const img = fitImage(frame())

		// 16:9 preserved and nothing padded: how the result is fitted onto the button is the image
		// element's `fillMode`, set per button, so the module must not decide it here.
		expect([img.width, img.height]).toEqual([IMAGE_SIZE, 180])
	})

	// Neither side may exceed the bound, whichever way round the frame is.
	it('bounds both sides, not just the wider one', () => {
		const portrait = fitImage(new Jimp({ width: 1080, height: 1920, color: 0x3366ccff }))

		expect(Math.max(portrait.width, portrait.height)).toBe(IMAGE_SIZE)
	})

	// Downscale only. scaleToFit would have enlarged these, inventing no detail while inflating the
	// base64 on every button that carries the picture.
	it.each([
		[160, 90], // a small snapshot
		[320, 176], // a preset thumbnail, as an AW-UE150 serves it — the size the bound is set to clear
		[IMAGE_SIZE, IMAGE_SIZE], // exactly the bound: already small enough, nothing to do
		[IMAGE_SIZE, 100],
	])('hands back a %ix%i frame untouched rather than enlarging it', (width, height) => {
		const img = fitImage(new Jimp({ width, height, color: 0x3366ccff }))

		expect([img.width, img.height]).toEqual([width, height])
	})

	it('still scales down a frame over the limit on only one side', () => {
		const wide = fitImage(new Jimp({ width: 1920, height: 100, color: 0x3366ccff }))

		expect(wide.width).toBe(IMAGE_SIZE)
		expect(wide.height).toBeLessThan(100)
	})
})

// The live image is fetched on its own clock, not in reply to a camera event, and (2.0 has no
// feedback subscribe callback) its lifetime is decided by a registry the feedback writes into.

// Stands in for the instance. `placed` is the set of feedbacks Companion still draws: getImage()
// ends in checkFeedbacks(), which re-runs their callbacks and re-registers them. Dropping an id
// from `placed` is a button that went away without unsubscribe() firing — the pruning case.
function fakeSelf(config = {}) {
	const self = {
		SERIES: { capabilities: { imageTransmission: true } },
		config: { host: '10.0.0.1', httpPort: 80, timeout: 2000, imageEnable: true, imageInterval: 1000, ...config },
		pollImage: false,
		pollImageGen: 0,
		imageSubscribers: new Map(),
		imageErrors: 0,
		placed: new Set(),
		log: vi.fn(),
	}

	self.getImage = vi.fn(async () => {
		for (const id of self.placed) self.imageSubscribers.set(id, Date.now())
	})

	return self
}

// Put a button on screen: placed, and its first evaluation has registered it.
function show(self, id) {
	self.placed.add(id)
	self.imageSubscribers.set(id, Date.now())
}

describe('the live image loop', () => {
	beforeEach(() => vi.useFakeTimers())
	afterEach(() => vi.useRealTimers())

	it('does not run while no button is showing the image', async () => {
		const self = fakeSelf()

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(5000)

		expect(self.getImage).not.toHaveBeenCalled()
		expect(self.pollImage).toBe(false)
	})

	it('does not run while the camera cannot do it, even with a button asking', async () => {
		const self = fakeSelf()
		self.SERIES.capabilities.imageTransmission = false
		show(self, 'a')

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(5000)

		expect(self.getImage).not.toHaveBeenCalled()
		expect(self.pollImage).toBe(false)
	})

	it('does not run while the user has not enabled it, even with a button asking', async () => {
		const self = fakeSelf({ imageEnable: false })
		show(self, 'a')

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(5000)

		expect(self.getImage).not.toHaveBeenCalled()
		expect(self.pollImage).toBe(false)
	})

	it('fetches a frame per interval while a button is showing the image', async () => {
		const self = fakeSelf()
		show(self, 'a')

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(0)
		expect(self.getImage).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(3000)
		expect(self.getImage).toHaveBeenCalledTimes(4)

		self.pollImage = false
	})

	it('starts one loop however many buttons show the image', async () => {
		const self = fakeSelf()
		show(self, 'a')
		show(self, 'b')

		startLiveImagePoll(self)
		startLiveImagePoll(self)
		startLiveImagePoll(self)

		await vi.advanceTimersByTimeAsync(1000)
		expect(self.getImage).toHaveBeenCalledTimes(2) // one loop's worth, not three

		self.pollImage = false
	})

	it('stops once the last button unsubscribes', async () => {
		const self = fakeSelf()
		show(self, 'a')

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(1000)

		// What unsubscribe() does when the feedback is removed.
		self.placed.delete('a')
		self.imageSubscribers.delete('a')

		await vi.advanceTimersByTimeAsync(2000)
		const settled = self.getImage.mock.calls.length

		await vi.advanceTimersByTimeAsync(5000)
		expect(self.getImage).toHaveBeenCalledTimes(settled) // no further frames
		expect(self.pollImage).toBe(false)
	})

	it('ages out a subscriber that went away without unsubscribing, rather than polling forever', async () => {
		const self = fakeSelf()
		show(self, 'a')

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(1000)
		expect(self.pollImage).toBe(true)

		// Button gone but unsubscribe never fired: the registry still holds its id, it just stops being re-registered.
		self.placed.delete('a')

		await vi.advanceTimersByTimeAsync(30000)

		expect(self.imageSubscribers.size).toBe(0)
		expect(self.pollImage).toBe(false)
	})

	it('backs off while the camera is failing rather than hammering it', async () => {
		const self = fakeSelf()
		show(self, 'a')
		self.imageErrors = 1 // getImage() sets this on a failed frame

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(0)
		expect(self.getImage).toHaveBeenCalledTimes(1)

		await vi.advanceTimersByTimeAsync(1000)
		expect(self.getImage).toHaveBeenCalledTimes(1) // would have been 2 at the normal interval

		await vi.advanceTimersByTimeAsync(4000)
		expect(self.getImage).toHaveBeenCalledTimes(2)

		self.pollImage = false
	})

	it('leaves only one loop running when a re-init restarts it mid-fetch', async () => {
		const self = fakeSelf()
		show(self, 'a')

		startLiveImagePoll(self)
		await vi.advanceTimersByTimeAsync(0)

		// What reInitAll() does: stop the loop, then re-evaluate the feedbacks to start it again, while
		// the old loop is still parked inside its sleep.
		self.pollImage = false
		startLiveImagePoll(self)

		self.getImage.mockClear()
		await vi.advanceTimersByTimeAsync(3000)

		expect(self.getImage).toHaveBeenCalledTimes(3) // one loop's cadence, not two interleaved

		self.pollImage = false
	})
})
