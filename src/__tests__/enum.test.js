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

	it('reads the POVCAM tables straight off their specification pages', () => {
		// Gain: 0x08 = 0 dB .. 0x26 = 30 dB, 0x80 = AGC ON.
		expect(e.ENUM_GAIN_POVCAM.at(0)).toEqual({ id: '80', label: 'Auto' })
		expect(e.ENUM_GAIN_POVCAM.at(1)).toEqual({ id: '08', label: '0 dB' })
		expect(e.ENUM_GAIN_POVCAM.at(-1)).toEqual({ id: '26', label: '30 dB' })

		// Chroma level: 0x3A (-70%) .. 0x9E (+30%), and the table has no OFF step.
		expect(e.ENUM_CHROMA_PCT_POVCAM.at(0)).toEqual({ id: '3A', label: '-70%' })
		expect(e.ENUM_CHROMA_PCT_POVCAM.at(-1)).toEqual({ id: '9E', label: '+30%' })
		expect(e.ENUM_CHROMA_PCT_POVCAM.some((x) => x.label === 'OFF')).toBe(false)

		// NR control is a level centred on 0x80, not the three-step ENUM_DNR table.
		expect(e.ENUM_NR_LEVEL_7.at(0)).toEqual({ id: '79', label: '-7' })
		expect(e.ENUM_NR_LEVEL_7.at(7)).toEqual({ id: '80', label: '0' })
		expect(e.ENUM_NR_LEVEL_7.at(-1)).toEqual({ id: '87', label: '+7' })

		// White balance is the common table plus ATW Lock.
		expect(e.ENUM_WHITEBALANCE_POVCAM.slice(0, e.ENUM_WHITEBALANCE.length)).toEqual(e.ENUM_WHITEBALANCE)
		expect(e.ENUM_WHITEBALANCE_POVCAM.at(-1)).toEqual({ id: 'E', label: 'ATW Lock' })

		// Shutter: the union of the four CamFormat tables, Auto first and Synchro Scan last. The steps
		// that only some formats offer say so, because the dropdown cannot know the current CamFormat.
		expect(e.ENUM_SHUTTER_POVCAM).toHaveLength(29)
		expect(e.ENUM_SHUTTER_POVCAM.at(0)).toEqual({ id: '00', label: 'Auto' })
		expect(e.ENUM_SHUTTER_POVCAM.at(-1)).toEqual({ id: 'FF', label: 'Syncro Scan' })
		expect(e.ENUM_SHUTTER_POVCAM.find((x) => x.id === '7C')).toEqual({ id: '7C', label: 'Step 1/25 (50Hz only)' })
		expect(e.ENUM_SHUTTER_POVCAM.find((x) => x.id === '80')).toEqual({ id: '80', label: 'Step 1/60' })

		// Colour temperature is the same 121-step grid as the HE130, but 14 of the values differ, so
		// POVCAM cannot borrow that table.
		expect(e.ENUM_COLOR_TEMPERATURE_POVCAM).toHaveLength(121)
		expect(e.ENUM_COLOR_TEMPERATURE_POVCAM.at(0)).toEqual({ id: '000', label: '2000K' })
		expect(e.ENUM_COLOR_TEMPERATURE_POVCAM.at(-1)).toEqual({ id: '078', label: '15000K' })
		expect(e.ENUM_COLOR_TEMPERATURE_POVCAM.find((x) => x.id === '011')).toEqual({ id: '011', label: '2250K' })
		expect(e.ENUM_COLOR_TEMPERATURE_POVCAM).not.toEqual(e.ENUM_COLOR_TEMPERATURE_NONLINEAR)
	})

	it('sizes each gain table to its camera range', () => {
		expect(e.ENUM_GAIN_HE50).toHaveLength(8) // auto + 0..18 dB in steps of 3
		expect(e.ENUM_GAIN_HE120).toHaveLength(20) // auto + 0..18 dB
		expect(e.ENUM_GAIN_UE160).toHaveLength(20) // auto + -6..12 dB
		expect(e.ENUM_GAIN_UBX100).toHaveLength(10) // auto + -6..18 dB in steps of 3
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
