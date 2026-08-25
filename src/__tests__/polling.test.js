import { describe, expect, it } from 'vitest'
import { refreshPresetCounters } from '../polling.js'

// Twelve QSJ:3C queries is what stands between "one preset changed" and refetching a whole bank of
// thumbnails. Cheap, but not free — so who asks, and how often, is the whole point of this loop.
function counterInstance(capabilities) {
	const self = {
		SERIES: { capabilities },
		config: { pollDelay: 0 },
		generation: 1,
		queries: [],
		presetCounterRun: false,
		presetCounterRunAgain: false,
		current: () => true,
		stopped: () => false,
		getCam: async (cmd) => {
			self.queries.push(cmd)
		},
	}
	return self
}

describe('refreshPresetCounters', () => {
	it('walks the twelve banks that cover a hundred presets', async () => {
		const self = counterInstance({ presetThumbnails: true, presetNames: true })

		await refreshPresetCounters(self)

		expect(self.queries).toEqual([
			'QSJ:3C:00',
			'QSJ:3C:01',
			'QSJ:3C:02',
			'QSJ:3C:03',
			'QSJ:3C:04',
			'QSJ:3C:05',
			'QSJ:3C:06',
			'QSJ:3C:07',
			'QSJ:3C:08',
			'QSJ:3C:09',
			'QSJ:3C:0A',
			'QSJ:3C:0B',
		])
	})

	// A model that has neither names nor thumbnails has nothing for the counters to invalidate, and
	// most of them do not answer QSJ:3C at all.
	it('asks nothing of a model with neither names nor thumbnails', async () => {
		const self = counterInstance({ presetThumbnails: false, presetNames: false })

		await refreshPresetCounters(self)

		expect(self.queries).toEqual([])
	})

	it('runs for a model with only one of the two', async () => {
		const names = counterInstance({ presetThumbnails: false, presetNames: true })
		const thumbnails = counterInstance({ presetThumbnails: true, presetNames: false })

		await refreshPresetCounters(names)
		await refreshPresetCounters(thumbnails)

		expect(names.queries).toHaveLength(12)
		expect(thumbnails.queries).toHaveLength(12)
	})

	// The three pE lines arrive one after another and each wants the counters read. Answering all three
	// in turn would be thirty-six queries for one event.
	it('coalesces requests that land while a run is going', async () => {
		const self = counterInstance({ presetThumbnails: true, presetNames: true })
		let reentered = false

		self.getCam = async (cmd) => {
			self.queries.push(cmd)
			if (reentered) return
			reentered = true
			// Two more callers during the first bank, as the three pE lines would be.
			await refreshPresetCounters(self)
			await refreshPresetCounters(self)
		}

		await refreshPresetCounters(self)

		// One extra pass for the requests that arrived mid-run, not one pass each.
		expect(self.queries).toHaveLength(24)
	})

	it('stops when the connection moved on', async () => {
		const self = counterInstance({ presetThumbnails: true, presetNames: true })
		self.stopped = () => self.queries.length >= 3

		await refreshPresetCounters(self)

		expect(self.queries).toHaveLength(3)
		// ...and leaves nothing behind that would block the next connection's run.
		expect(self.presetCounterRun).toBe(false)
	})
})
