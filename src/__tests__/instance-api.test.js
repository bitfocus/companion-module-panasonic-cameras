import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { InstanceBase } from '@companion-module/base'
import PanasonicCameraInstance from '../index.js'
import { initialData } from '../data.js'

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

	// A balance command turned down in the reply leaves no result: the camera never ran one. It has to
	// reach parseUpdate all the same, so that the OK of an earlier run is cleared rather than left
	// standing as if it belonged to the attempt just refused — a getCam that stopped at the refusal
	// branch would keep it. Measured on an AW-HE40 V2.1: with the white balance mode set to VAR, AWB is
	// ruled out and the camera answers ER3:OWS to the request itself, pushing nothing afterwards.
	describe('getCam and a refused balance command', () => {
		const call = async (cmd, body, seed = {}) => {
			const reported = []
			const self = {
				generation: 0,
				current: () => true,
				config: { host: '1.2.3.4', httpPort: 80 },
				data: { ...initialData(), ...seed },
				httpGet: async () => ({ body }),
				traced: () => {},
				parseSafely: (line, parse) => parse(),
				reportRefusal: (refusal) => reported.push(refusal),
				checkVariables: () => {},
				checkAllFeedbacks: () => {},
				onRequestSucceeded: () => {},
			}

			await PanasonicCameraInstance.prototype.getCam.call(self, cmd)
			return { data: self.data, reported }
		}

		it.each([
			['OWS', 'OWS', 'awbResult'], // taken on
			['OWS', 'ER3:OWS', 'awbResult'], // turned down
			['OWS', 'ER2:OWS', 'awbResult'],
			['OAS', 'OAS', 'abbResult'],
			['OAS', 'ER3:OAS', 'abbResult'],
		])('clears the result when %s is answered with %s', async (cmd, body, key) => {
			const { data } = await call(cmd, body, { [key]: 'OK' })

			expect(data[key]).toBeNull()
		})

		it('still logs a refusal, so the operator sees it in the log too', async () => {
			const { reported } = await call('OWS', 'ER3:OWS')

			expect(reported).toEqual([{ code: 3, command: 'OWS' }])
		})

		it('says nothing about a command the camera simply took on', async () => {
			const { reported } = await call('OWS', 'OWS')

			expect(reported).toHaveLength(0)
		})

		it('leaves the result alone when the model has no such command', async () => {
			const { data } = await call('OAS', 'ER1:OAS', { abbResult: 'OK' })

			expect(data.abbResult).toBe('OK')
		})
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
