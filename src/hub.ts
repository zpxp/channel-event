import { Channel, _createChannel, _ChannelInternal } from "./channel";
import { EventIterable } from "./generator";
import { generatorImplements } from "./generatorImpls";

export interface Hub {
	/**
	 * Create a new channel inside this hub. A channel broadcasts events to all other channels inside the same hub.
	 * @param id 
	 */
	newChannel(id?: string): Channel;


	/**
	 * Add a custom generator middleware to the event channel generator. Whenever a generator `yield`s an `EventIterable`, the hub will look for
	 * any middleware whos function name matches the `EventIterable.function`. 
	 * 
	 * @param functionName The name of this generator middleware to be added
	 * @param middleware The middleware implementation that takes 1-2 args: The `EventIterable` that was yielded, in the generator, and a reference to the `Channel` object
	 */
	addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel?: Channel) => Promise<EventIterable>): void;

	/**
	 * A static instance of a `Channel` that sits on this hub
	 */
	global: Channel;

	dispose(): void;
}

class _HubInternal implements Hub {
	static generatorMiddlewares: { [name: string]: Array<(args: EventIterable, channel: Channel) => Promise<EventIterable>> } = {};
	private _globalChannel: Channel<any>;

	get generatorMiddlewares() {
		return _HubInternal.generatorMiddlewares;
	}
	private channels: _ChannelInternal[];

	get global(): Channel {
		if (!this._globalChannel) {
			this._globalChannel = this.newChannel();
		}
		return this._globalChannel;
	}

	constructor() {
		this.channels = [];
	}

	newChannel(id?: string): Channel {
		const chann = _createChannel(this, id);

		this.channels.push(chann);
		chann.onDispose(() => {
			const index = this.channels.indexOf(chann);
			if (~index) {
				this.channels.splice(index, 1);
			}
		});
		return chann;
	}

	dispose() {
		if (this._globalChannel) {
			this._globalChannel.dispose();
			this._globalChannel = null;
		}
		for (let index = 0; index < this.channels.length; index++) {
			const chann = this.channels[index];
			chann.dispose();
		}
		this.channels = [];
	}

	handleSend(type: string, data: any) {
		let returnData = {};
		for (let index = 0; index < this.channels.length; index++) {
			const chann = this.channels[index];
			returnData = { ...returnData, ...chann.checkSend(type, data) };
		}
		return returnData;
	}

	static addGeneratorMiddleware(
		functionName: string,
		middleware: (args: EventIterable, channel: Channel) => Promise<EventIterable>
	): void {
		if (!_HubInternal.generatorMiddlewares[functionName]) {
			_HubInternal.generatorMiddlewares[functionName] = [];
		}

		_HubInternal.generatorMiddlewares[functionName].push(middleware);
	}

	addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel: Channel) => Promise<EventIterable>): void {
		_HubInternal.addGeneratorMiddleware(functionName, middleware);
	}
}

export function createHub(): Hub {
	const hub = new _HubInternal();
	return hub as Hub;
}

export type t_HubInternal = _HubInternal;

// add default generator impls
for (const key in generatorImplements) {
	if (generatorImplements.hasOwnProperty(key)) {
		const impl = (generatorImplements as any)[key];

		_HubInternal.addGeneratorMiddleware(key, impl);
	}
}
