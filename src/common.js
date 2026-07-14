import { MODELS, SERIES_SPECS } from './models.js'

export function getAndUpdateSeries(self) {
	// Set the model and series selected, if in auto, detect what model is connected
	if (self.config.model === 'Auto') {
		self.data.model = self.data.modelAuto
	} else {
		self.data.model = self.config.model
	}

	if (self.data.model !== null) {
		self.data.series = MODELS.find((MODELS) => MODELS.id === self.data.model).series
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
