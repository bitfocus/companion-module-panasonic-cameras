import { MODELS } from './models.js'

export const ConfigFields = [
	{
		type: 'static-text',
		id: 'info',
		width: 12,
		label: 'Information',
		value:
			"This module controls Panasonic cameras, you can find supported models in the dropdown below.<br/>If your camera isn't in the list below yet, feel free to try it anyway by option 'Other Cameras'. This should still support some basic operation.",
	},
	{
		type: 'textinput',
		id: 'host',
		label: 'Camera IP / Hostname',
		width: 4,
		// regex: Regex.IP
	},
	{
		type: 'number',
		id: 'httpPort',
		label: 'HTTP Port (Default: 80)',
		width: 3,
		default: 80,
		min: 1,
		max: 65535,
	},
	{
		type: 'static-text',
		id: 'dummy1',
		width: 12,
		label: ' ',
		value: ' ',
	},
	{
		type: 'static-text',
		id: 'modelInfo',
		width: 12,
		label: 'Camera Model',
		value: "Please select the camera model or feel free to leave it on 'Auto Detect'.",
	},
	{
		type: 'dropdown',
		id: 'model',
		label: 'Select Your Camera Model',
		width: 6,
		default: 'Auto',
		choices: MODELS,
		minChoicesForSearch: 5,
	},
	{
		type: 'static-text',
		id: 'dummy2',
		width: 12,
		label: ' ',
		value: ' ',
	},
	{
		type: 'static-text',
		id: 'Info',
		width: 12,
		label: 'Other Settings',
		value:
			'These setting can be left on the default values and should give you a consistent setup, but they are there for you to use if need be.',
	},
	{
		type: 'number',
		id: 'timeout',
		label: 'Timeout (ms)',
		width: 3,
		default: 2000,
		min: 100,
		max: 5000,
	},
	{
		type: 'static-text',
		id: 'timeoutInfo',
		width: 9,
		label: '',
		value:
			'Sets the maximum amount of time to wait for a response from the camera after a request command. Otherwise the connection is considered lost and repeated attempts are made to reinitialize the connection.',
	},
	{
		type: 'checkbox',
		id: 'pollAllow',
		width: 1,
		label: 'Allow',
		default: true,
	},
	{
		type: 'static-text',
		id: 'pollInfo',
		width: 9,
		label: 'Polling',
		value:
			'Allows periodic querying of data that is not automatically updated by the camera. It is mandatory to obtain updated operational data from camera models that do not support any update notification subscription. Additionally allows operating status values ​​to be kept in sync that never have an update notification. The delay setting specifies the waiting time between individual requests to the camera.',
	},
	{
		type: 'number',
		id: 'pollDelay',
		label: 'Poll Delay (ms)',
		width: 2,
		default: 100,
		min: 1,
		max: 1000,
	},
	{
		type: 'checkbox',
		id: 'subscriptionEnable',
		width: 1,
		label: 'Enable',
		default: true,
	},
	{
		type: 'static-text',
		id: 'subscriptionInfo',
		width: 11,
		label: 'Subscription',
		value:
			'Enables the event update subscription channel setup from the camera to this module instance on camera models that support this feature. If this option is disabled, the camera will always be polled for states on a regular basis (if polling is permitted). May be disabled for network constellations where the camera cannot establish a TCP connection to this instance, for example due to an intermediate NAT router, a firewall or a faulty IP configuration.',
	},
	{
		type: 'checkbox',
		id: 'portManual',
		width: 1,
		label: 'Manual',
		default: false,
	},
	{
		type: 'static-text',
		id: 'manualTCPInfo',
		width: 9,
		label: 'Local TCP port assignment',
		value:
			'Manually bind local TCP Port for incoming update subscription connection. May be helpfull only for some special network configurations. Each instance / camera needs its own port.',
	},
	{
		type: 'number',
		id: 'tcpPort',
		label: 'TCP Port (1024-65535)',
		width: 2,
		default: 31004,
		min: 1024,
		max: 65535,
	},
	{
		type: 'checkbox',
		id: 'debug',
		width: 1,
		label: 'Enable',
		default: false,
	},
	{
		type: 'static-text',
		id: 'debugInfo',
		width: 11,
		label: 'Debug Mode',
		value:
			'This allows you to output the communication between this module instance and the camera in detail. Do not enable this unless you have protocol-level issues that you want to investigate. It will cause the log to be flooded with a lot of data, but it can also cause operational delays and a general slowdown of the system. DO NOT ENABLE THIS IN PRODUCTION!',
	},
]
