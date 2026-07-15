import { describe, expect, it } from 'vitest'
import { e } from '../enum.js'
import { MODELS, SERIES_SPECS } from '../models.js'

// enum.js tables are generated from rules; these pin the produced values. Ids are persisted in
// button configs, labels are display only.

describe('generated enums', () => {
	it('spaces gain in hex steps from 0 dB = 0x08, with 0x80/0x81 for the auto/manual modes', () => {
		expect(e.ENUM_GAIN_UE150.at(0)).toEqual({ id: '80', label: 'Auto' })
		expect(e.ENUM_GAIN_UE150.at(1)).toEqual({ id: '05', label: '-3 dB' })
		expect(e.ENUM_GAIN_UE150.at(-1)).toEqual({ id: '32', label: '42 dB' })
		expect(e.ENUM_GAIN_CX350.at(-1)).toEqual({ id: '81', label: 'Manual' })
		expect(e.ENUM_GAIN_UE4.at(0)).toEqual({ id: '08', label: '0 dB' }) // no auto mode on the UE4

		// 0 dB must land on 0x08 in every table that has it
		for (const [name, table] of Object.entries(e).filter(
			([k]) => k.startsWith('ENUM_GAIN_') && k !== 'ENUM_GAIN_UB300',
		)) {
			const zero = table.find((x) => x.label === '0 dB')
			if (zero) expect(zero.id, name).toBe('08')
		}
	})

	it('sizes each gain table to its camera range', () => {
		expect(e.ENUM_GAIN_HE50).toHaveLength(8) // auto + 0..18 dB in steps of 3
		expect(e.ENUM_GAIN_HE120).toHaveLength(20) // auto + 0..18 dB
		expect(e.ENUM_GAIN_UE160).toHaveLength(18) // auto + -4..12 dB
		expect(e.ENUM_GAIN_CX350).toHaveLength(51) // auto + -6..42 dB + manual
	})

	it('centres chroma level on 0x80 and keeps an explicit OFF', () => {
		expect(e.ENUM_CHROMA_PCT_99.at(0)).toEqual({ id: '00', label: 'OFF' })
		expect(e.ENUM_CHROMA_PCT_99.at(1)).toEqual({ id: '1D', label: '-99%' })
		expect(e.ENUM_CHROMA_PCT_99.at(-1)).toEqual({ id: 'E3', label: '+99%' })
		expect(e.ENUM_CHROMA_PCT_40.at(-1)).toEqual({ id: 'A8', label: '+40%' })
		// the 40 table is the 99 table cut short, so they must agree where they overlap
		expect(e.ENUM_CHROMA_PCT_40).toEqual(e.ENUM_CHROMA_PCT_99.slice(0, e.ENUM_CHROMA_PCT_40.length))
	})

	it('numbers presets 1..100 while addressing them 0-based', () => {
		expect(e.ENUM_PRESET).toHaveLength(100)
		expect(e.ENUM_PRESET.at(0)).toEqual({ id: '00', label: 'Preset 1' })
		expect(e.ENUM_PRESET.at(-1)).toEqual({ id: '99', label: 'Preset 100' })
	})

	it('maps preset recall speed n onto 250 + 25n, capped at 999', () => {
		expect(e.ENUM_PRESET_SPEED.at(0)).toEqual({ id: '000', label: 'Speed Max' })
		expect(e.ENUM_PRESET_SPEED.at(1)).toEqual({ id: '999', label: 'Speed 30' }) // 250 + 750 = 1000, capped
		expect(e.ENUM_PRESET_SPEED.at(2)).toEqual({ id: '975', label: 'Speed 29' })
		expect(e.ENUM_PRESET_SPEED.at(-1)).toEqual({ id: '275', label: 'Speed  1' })

		// Regenerating fixes a duplicate label (id 550 was "Speed 13"); id unchanged, so existing configs resolve.
		expect(e.ENUM_PRESET_SPEED.find((x) => x.id === '550')).toEqual({ id: '550', label: 'Speed 12' })
		const labels = e.ENUM_PRESET_SPEED.map((x) => x.label)
		expect(new Set(labels).size, 'speed labels must be unique').toBe(labels.length)
	})

	it('appends the recall-time entries, addressed in hex, after the speed entries', () => {
		expect(e.ENUM_PRESET_SPEED_TIME.slice(0, e.ENUM_PRESET_SPEED.length)).toEqual(e.ENUM_PRESET_SPEED)
		expect(e.ENUM_PRESET_SPEED_TIME.at(-1)).toEqual({ id: '001', label: 'Time  1s' })
		expect(e.ENUM_PRESET_SPEED_TIME.find((x) => x.label === 'Time 99s')).toEqual({ id: '063', label: 'Time 99s' }) // 0x63
	})

	it('generates sequential ids for the non-linear colour temperature table', () => {
		expect(e.ENUM_COLOR_TEMPERATURE_NONLINEAR).toHaveLength(121)
		expect(e.ENUM_COLOR_TEMPERATURE_NONLINEAR.at(0)).toEqual({ id: '000', label: '2000K' })
		expect(e.ENUM_COLOR_TEMPERATURE_NONLINEAR.at(-1)).toEqual({ id: '078', label: '15000K' })
		expect(e.ENUM_COLOR_TEMPERATURE_LINEAR.at(0)).toEqual({ id: '000', label: '2400K' })
	})

	it('gives every entry of every enum a unique id', () => {
		for (const [name, table] of Object.entries(e)) {
			const ids = table.map((x) => x.id)
			expect(new Set(ids).size, name).toBe(ids.length)
		}
	})
})

describe('models', () => {
	it('lists each camera model exactly once', () => {
		const ids = MODELS.map((m) => m.id)
		expect(new Set(ids).size, 'listed multiple times').toBe(ids.length)
	})

	it('points every model at a series that exists', () => {
		const known = new Set([...SERIES_SPECS.map((s) => s.id), 'Auto'])
		for (const m of MODELS) expect(known, m.id).toContain(m.series)
	})

	it('gives every series the full capability set, so a missing key cannot read as false', () => {
		const base = SERIES_SPECS.find((s) => s.id === 'Other').capabilities
		for (const s of SERIES_SPECS) {
			expect(Object.keys(s.capabilities).sort(), s.id).toEqual(Object.keys(base).sort())
		}
	})
})
