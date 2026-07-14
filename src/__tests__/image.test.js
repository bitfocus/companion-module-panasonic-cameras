import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Jimp } from 'jimp'
import { IMAGE_SCALING, IMAGE_SIZE, fitImage } from '../common.js'
import { startLiveImagePoll } from '../polling.js'

// A 16:9 frame, the shape every camera answers with.
const frame = () => new Jimp({ width: 1920, height: 1080, color: 0x3366ccff })

describe('fitting a camera frame onto a square button', () => {
	it('letterboxes by default, leaving the frame whole', () => {
		const img = fitImage(frame(), 'letterbox')

		// Scaled down until it fits and no further: 16:9 is preserved, and the button's own background
		// shows above and below rather than a black bar baked into the image.
		expect([img.width, img.height]).toEqual([IMAGE_SIZE, 162])
	})

	it('crops to fill the button, at the cost of the sides of the frame', () => {
		const img = fitImage(frame(), 'crop')

		expect([img.width, img.height]).toEqual([IMAGE_SIZE, IMAGE_SIZE])
	})

	it('squeezes to fill the button, at the cost of the aspect ratio', () => {
		const img = fitImage(frame(), 'squeeze')

		expect([img.width, img.height]).toEqual([IMAGE_SIZE, IMAGE_SIZE])
	})

	it('letterboxes a config saved before the setting existed', () => {
		// An old connection has no imageScaling at all, and must keep behaving as it did.
		expect([fitImage(frame(), undefined).width, fitImage(frame(), undefined).height]).toEqual([IMAGE_SIZE, 162])
	})

	it('offers exactly the modes the scaling knows how to carry out', () => {
		// The dropdown and the switch are two lists of the same ids; this is what stops them drifting.
		expect(IMAGE_SCALING.map((m) => m.id)).toEqual(['letterbox', 'crop', 'squeeze'])
	})
})

// The live image is the one thing this module fetches on a clock of its own rather than in reply to
// a camera event, and — because module API 2.0 has no feedback subscribe callback — the only thing
// whose lifetime is decided by a registry the feedback writes into from its own callback. That
// registry, and the loop it drives, is what is pinned here.

// Stands in for the instance. `placed` is the set of feedback instances Companion would still be
// drawing: getImage() ends in checkFeedbacks(), which re-runs their callbacks, which is what
// re-registers them. Dropping an id from `placed` is therefore a button that went away without
// unsubscribe() ever firing — the case the pruning exists for.
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

// Put a button on screen: it is placed, and its first evaluation has registered it.
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

		// Every evaluation calls in, and there are many of them per second.
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

		// What unsubscribe() does when the feedback is removed from the button.
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

		// The button is gone but unsubscribe never fired, so the registry still holds its id: it just
		// stops being re-registered, because it is no longer evaluated.
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

		// What reInitAll() does: stop the loop, then re-evaluate the feedbacks, which starts it again —
		// while the old loop is still parked inside its sleep.
		self.pollImage = false
		startLiveImagePoll(self)

		self.getImage.mockClear()
		await vi.advanceTimersByTimeAsync(3000)

		expect(self.getImage).toHaveBeenCalledTimes(3) // one loop's cadence, not two interleaved

		self.pollImage = false
	})
})
