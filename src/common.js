import { MODELS, SERIES_SPECS } from './models.js'
import { e } from './enum.js'

export function getAndUpdateSeries(self) {
	if (self.config.model === 'Auto') {
		self.data.model = self.data.modelAuto
	} else {
		self.data.model = self.config.model
	}

	if (self.data.model !== null) {
		// Unknown auto-detected model falls back to the generic set; avoids a TypeError on undefined.
		self.data.series = MODELS.find((m) => m.id === self.data.model)?.series ?? 'Other'
	}

	let SERIES =
		self.data.series !== 'Auto' && self.data.series !== 'Other'
			? SERIES_SPECS.find((SERIES_SPECS) => SERIES_SPECS.id === self.data.series)
			: undefined

	return SERIES || SERIES_SPECS.find((SERIES_SPECS) => SERIES_SPECS.id === 'Other')
}

export function getNext(values, key, step = 1, overrun = true) {
	const firstIndex = 0
	const lastIndex = values.length - 1
	let i = values.findIndex((v) => v.id === key)

	if (i < firstIndex) return values[firstIndex] // case not found
	if (!overrun) {
		if (i + step < firstIndex) return values[firstIndex]
		if (i + step > lastIndex) return values[lastIndex]
	}
	return values[(values.length + (step % values.length) + i) % values.length]
}

export function getNextValue(value, min, max, step = 1) {
	return constrainRange(value + step, min, max)
}

export function getLabel(values, key) {
	return values.find((v) => v.id === key)?.label
}

export function toHexString(value, length) {
	return parseInt(value).toString(16).toUpperCase().padStart(length, '0')
}

export function constrainRange(value, min, max) {
	if (value > max) return max
	if (value < min) return min
	return value
}

export function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

// Waits for `promise` up to `ms`, clearing the loser's timer so a torn-down connection has no
// pending work left behind.
export function raceTimeout(promise, ms) {
	let timer

	return Promise.race([promise, new Promise((resolve) => (timer = setTimeout(resolve, ms)))]).finally(() =>
		clearTimeout(timer),
	)
}

export const IMAGE_SIZE = 288

export const IMAGE_SCALING = [
	{ id: 'letterbox', label: 'Letterbox' },
	{ id: 'crop', label: 'Crop' },
	{ id: 'squeeze', label: 'Squeeze' },
]

// Jimp mutates and returns the image it is given.
export function fitImage(img, scaling) {
	switch (scaling) {
		case 'crop':
			return img.cover({ w: IMAGE_SIZE, h: IMAGE_SIZE })
		case 'squeeze':
			return img.resize({ w: IMAGE_SIZE, h: IMAGE_SIZE })
		default:
			// Letterbox: scale to fit without padding, so the button background shows through, not a black bar.
			return img.scaleToFit({ w: IMAGE_SIZE, h: IMAGE_SIZE })
	}
}

// Choice ids are 0-based zero-padded preset numbers ("00".."99"); labels count from 1. Expressions
// yield an unpadded number not in the choice list, so allowInvalidValues is required or Companion
// drops expression-driven preset buttons. Shared by actions and feedbacks so they cannot drift.
export function optPresetNumber(id, max) {
	return {
		type: 'dropdown',
		label: 'Preset #',
		id: id,
		default: e.ENUM_PRESET[0].id,
		choices: e.ENUM_PRESET.slice(0, max),
		allowInvalidValues: true,
		expressionDescription:
			`This expression should return a 0-based preset index: 0 is Preset 1, ${max - 1} is Preset ${max}. ` +
			`Values outside this range are constrained to it; an unreadable value takes no action.`,
	}
}

// Selected preset as a 0-based index (parseInt reads both '07' and 7), or null if not a number.
export function parsePresetNumber(value, max) {
	const idx = constrainRange(parseInt(value, 10), 0, max - 1)
	return isNaN(idx) ? null : idx
}

// The option ids an entity definition declares, plus each default. Excludes static-text and id-less
// fields, which are not options.
export function optionSpecs(definitions) {
	return Object.fromEntries(
		Object.entries(definitions).map(([id, definition]) => {
			const fields = (definition.options ?? []).filter((o) => o.id !== undefined && o.type !== 'static-text')
			return [
				id,
				{
					ids: fields.map((field) => field.id),
					defaults: Object.fromEntries(
						fields.filter((field) => field.default !== undefined).map((field) => [field.id, field.default]),
					),
				},
			]
		}),
	)
}
