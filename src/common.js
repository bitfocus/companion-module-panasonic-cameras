import { MODELS, SERIES_SPECS } from './models.js'
import { e } from './enum.js'

export function getAndUpdateSeries(self) {
	// Set the model and series selected, if in auto, detect what model is connected
	if (self.config.model === 'Auto') {
		self.data.model = self.data.modelAuto
	} else {
		self.data.model = self.config.model
	}

	if (self.data.model !== null) {
		// A camera is free to report a model this table has never heard of, and the auto-detected id is
		// taken from its answer unvalidated (parser.js). Falling back to the generic feature set gives
		// that camera basic operation; reading `.series` off the undefined this used to find took the
		// whole re-initialisation down with a TypeError instead.
		self.data.series = MODELS.find((m) => m.id === self.data.model)?.series ?? 'Other'
	}

	// Find the specific commands for a given series
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

// Waits for `promise`, but no longer than `ms`. Leaves no timer behind either way — a bare
// Promise.race against sleep() keeps the loser's timer pending, which is enough to make a torn-down
// connection look like it still has work outstanding.
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
			// Letterbox scales down until the whole frame fits, and stops there — the result is 288x162
			// rather than a padded square, so the button's own background shows through above and below
			// instead of a baked-in black bar.
			return img.scaleToFit({ w: IMAGE_SIZE, h: IMAGE_SIZE })
	}
}

// The preset dropdown's choice ids are the camera's own preset numbers — 0-based and zero-padded
// ("00".."99") — while the labels count from 1. Any field can hold an expression in 2.0, and an
// expression yields a plain number rather than one of those padded strings: a value the choices do
// not list. So the field has to accept it (`allowInvalidValues`, without which Companion would drop
// every expression-driven preset button) and the reader below has to make sense of both forms.
// Action and feedbacks share them, so the two cannot drift apart.
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

// The selected preset as a 0-based index — parseInt reads both the dropdown's '07' and an
// expression's 7 — or null when the value does not read as a number at all.
export function parsePresetNumber(value, max) {
	const idx = constrainRange(parseInt(value, 10), 0, max - 1)
	return isNaN(idx) ? null : idx
}

// The option ids an entity definition declares, plus the default for each. Both the presets we hand
// out and the buttons already on disk are reconciled against this, so they are repaired by the same
// rule. Static text carries no value, and a field without an id is not an option at all.
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
