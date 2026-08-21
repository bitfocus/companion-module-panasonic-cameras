import { MODELS } from './models.js'

export const FACTORY_LOGIN = { username: 'admin', password: '12345' }

const section = (id, label) => ({ type: 'static-text', id, label, value: '<hr>', width: 12 })

export const ConfigFields = [
	{
		type: 'textinput',
		id: 'host',
		label: 'Camera IP / Hostname',
		description: 'The address the camera answers on. Nothing is queried until this is set.',
		width: 6,
		default: '',
		// regex: Regex.IP
	},
	{
		type: 'number',
		id: 'httpPort',
		label: 'HTTP Port',
		description: 'The port the camera serves its web interface on. Panasonic cameras use 80 unless told otherwise.',
		width: 6,
		default: 80,
		min: 1,
		max: 65535,
	},
	{
		type: 'number',
		id: 'timeout',
		label: 'Timeout (ms)',
		description:
			'How long to wait for the camera to answer a request. Past this the connection is considered lost, and repeated attempts are made to re-initialise it.',
		width: 6,
		default: 2000,
		min: 100,
		max: 5000,
	},

	section('sectionAuth', ''),
	{
		type: 'textinput',
		id: 'username',
		label: 'User Name',
		description: 'The user account this connection uses on request. Default: admin',
		width: 6,
		default: FACTORY_LOGIN.username,
	},
	{
		type: 'secret-text',
		id: 'password',
		label: 'Password',
		description: 'The password for that account. Default: 12345',
		width: 6,
		default: FACTORY_LOGIN.password,
	},
	{
		type: 'static-text',
		id: 'authDetected',
		label: '',
		width: 6,
		value: '', // filled per instance by getConfigFields()
	},

	section('sectionModel', ''),
	{
		type: 'dropdown',
		id: 'model',
		label: 'Camera Model',
		description:
			"Leave this on 'Auto Detect' and the camera is asked what it is. If your model is not listed, 'Other Cameras' drives it with a generic feature set, which should still give you basic operation.",
		width: 6,
		default: 'Auto',
		choices: MODELS,
		minChoicesForSearch: 5,
	},
	{
		type: 'static-text',
		id: 'modelDetected',
		label: '',
		width: 6,
		value: '', // filled per instance by getConfigFields()
	},

	section('sectionUpdates', ''),
	{
		type: 'checkbox',
		id: 'subscriptionEnable',
		label: 'Subscription',
		description:
			'Let the camera push its state changes to this instance, on models that support it. With this off, the camera is polled for its state instead (if polling is allowed below). Turn it off where the camera cannot open a TCP connection back to Companion — behind a NAT router or a firewall, or on a faulty IP configuration.',
		width: 6,
		default: true,
		disableAutoExpression: true, // referenced by an isVisibleExpression below
	},
	{
		type: 'checkbox',
		id: 'portManual',
		label: 'Manual Local TCP Port',
		description:
			'Bind the local port the subscription connects back to by hand instead of letting the system pick one. Only useful for special network configurations. Each camera needs its own port.',
		width: 6,
		default: false,
		disableAutoExpression: true,
		isVisibleExpression: '$(options:subscriptionEnable)', // there is no connection back without one
	},
	{
		type: 'number',
		id: 'tcpPort',
		label: 'Local TCP Port',
		description: 'The port to bind, when the local port is assigned by hand.',
		width: 6,
		default: 31004,
		min: 1024,
		max: 65535,
		isVisibleExpression: '$(options:subscriptionEnable) && $(options:portManual)',
	},
	{
		type: 'checkbox',
		id: 'pollAllow',
		label: 'Polling',
		description:
			'Periodically query the data the camera does not report on its own. This is mandatory for models that support no update notification subscription, and it also keeps the operating values in sync that never have an update notification.',
		width: 6,
		default: true,
		disableAutoExpression: true,
	},
	{
		type: 'number',
		id: 'pollDelay',
		label: 'Poll Delay (ms)',
		description: 'The waiting time between individual poll requests to the camera.',
		width: 6,
		default: 100,
		min: 1,
		max: 1000,
		isVisibleExpression: '$(options:pollAllow)',
	},

	section('sectionImage', ''),
	{
		type: 'checkbox',
		id: 'imageEnable',
		label: 'Live Image',
		description:
			'Periodically fetch a snapshot from the camera and offer it as a button background, through the feedback "System - Live Image". It is only requested while a button actually shows one. The camera serves these snapshots from the same web server that answers the control commands, so a short interval may slow down its response to those.',
		width: 6,
		default: true,
		disableAutoExpression: true,
	},
	{
		type: 'number',
		id: 'imageInterval',
		label: 'Image Interval (ms)',
		description: 'How often a new snapshot is fetched while a button is showing one.',
		width: 6,
		default: 1000,
		min: 200,
		max: 60000,
		isVisibleExpression: '$(options:imageEnable)',
	},

	section('sectionDiagnostics', ''),
	{
		type: 'checkbox',
		id: 'trace',
		label: 'Trace Polling',
		description:
			'Log every request and response of the repeating status, update and image polling. Everything else this instance does is logged at debug level regardless, and Companion filters that for you. Only turn this on to investigate a protocol-level problem: the polling traffic is continuous, so it evicts the rest of the log history within minutes. DO NOT ENABLE THIS IN PRODUCTION!',
		width: 6,
		default: false,
	},
]

const warn = (text) => `<mark>⚠ ${text}</mark>`

export function describeDetectedModel(config, data) {
	const detected = data?.modelAuto

	if (!detected) {
		return 'Nothing detected yet — the camera has not answered. Check the address above, or open this panel again once the connection is up.'
	}

	const label = MODELS.find((m) => m.id === detected)?.label
	const selected = config?.model

	const pinned = selected && selected !== 'Auto' && selected !== 'Other'

	if (pinned && selected !== detected) {
		return warn(
			`Detected <b>${label ?? detected}</b>, but this connection is set to <b>${selected}</b>. ` +
				`The camera is driven as the model you selected, which may not match what it can do.`,
		)
	}

	if (!label) {
		return `Detected <b>${detected}</b>, which is not a model this module knows. It is driven with the generic 'Other Cameras' feature set, so expect only basic operation.`
	}

	return `Detected <b>${label}</b>.`
}

export function describeAuth(data) {
	const { state, scheme, realm } = data?.auth ?? {}
	const named = { digest: 'Digest', basic: 'Basic' }[scheme] ?? scheme
	const forRealm = realm ? ` for realm "${realm}"` : ''

	switch (state) {
		case 'authenticated':
			return `<b>Logged in</b> with ${named} authentication${forRealm}.`
		case 'required':
			return warn(`This camera requires a login${forRealm}. Fill in the user name and password above.`)
		case 'rejected':
			return warn(`The camera rejected this user name and password${forRealm}.`)
		case 'unsupported':
			return warn(
				`The camera asked for ${named ?? 'a login method'}, which this module cannot answer. Set its ` +
					"'Auth. method' to 'Digest' or 'Basic' in the camera's web menu.",
			)
		default:
			return ''
	}
}

const SEEDED_TOGETHER = new Set(['username', 'password'])

// Fields added after a config's last Save are absent from it and read `undefined` (NaN poll delay,
// invalid dropdown). Fill from each field's declared default so the rest of the module can treat
// this.config as complete.
export function applyConfigDefaults(config) {
	const filled = { ...config }

	for (const field of ConfigFields) {
		if (field.type === 'static-text' || SEEDED_TOGETHER.has(field.id) || field.default === undefined) continue
		if (filled[field.id] === undefined) filled[field.id] = field.default
	}

	return filled
}
