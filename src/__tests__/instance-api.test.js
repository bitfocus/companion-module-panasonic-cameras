import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { InstanceBase } from '@companion-module/base'
import PanasonicCameraInstance from '../index.js'

// A call to a method InstanceBase lacks fails only when Companion runs the module — lint and
// definition tests never catch it. The 2.0 migration left a subscribeFeedbacks() call that died on connect.

const baseMethods = new Set()
for (let proto = InstanceBase.prototype; proto && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
	for (const name of Object.getOwnPropertyNames(proto)) baseMethods.add(name)
}

const ownMethods = new Set()
for (
	let proto = PanasonicCameraInstance.prototype;
	proto && proto !== Object.prototype;
	proto = Object.getPrototypeOf(proto)
) {
	for (const name of Object.getOwnPropertyNames(proto)) ownMethods.add(name)
}

// Fields assigned at runtime, not declared as methods.
const ownFields = [
	'config',
	'data',
	'poll',
	'server',
	'SERIES',
	'speedChangeEmitter',
	'zSpeed',
	'fSpeed',
	'ptSpeed',
	'pSpeed',
	'tSpeed',
	'tcpPortSelected',
]

describe('instance API', () => {
	it('only calls methods that InstanceBase actually has', () => {
		const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')

		const called = new Set()
		for (const m of src.matchAll(/\bthis\.(\w+)\s*\(/g)) called.add(m[1])

		const unknown = [...called].filter(
			(name) => !baseMethods.has(name) && !ownMethods.has(name) && !ownFields.includes(name),
		)
		expect(unknown, 'these are called on the instance but exist neither on InstanceBase nor on the module').toEqual([])
	})

	it('does not call the feedback subscribe hooks that 2.0 removed', () => {
		expect(baseMethods.has('subscribeFeedbacks')).toBe(false)
		const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8')
		expect(src).not.toMatch(/\bthis\.subscribeFeedbacks\s*\(/)
	})

	it('exports the entrypoint the 2.0 host expects', async () => {
		const mod = await import('../index.js')
		expect(mod.default.prototype).toBeInstanceOf(InstanceBase)
		expect(Array.isArray(mod.UpgradeScripts)).toBe(true)
	})
})
