import { _createChannel, _ChannelInternal, IChannelMessage } from "./channel";
import { EventIterable } from "./generator";
import { generatorImplements } from "./generatorImpls";
import { IHub } from "./IHub";
import { IChannel } from "./IChannel";
import { EventMiddleware, EventMiddlewareContext } from "./types";

export const channelReturnSym = typeof Symbol === "undefined" ? "__CHANNEL_RTN" : Symbol.for("channel-event/__CHANNEL_RTN");

class _HubInternal implements IHub {
	private static globalGeneratorMiddlewares: { [name: string]: Array<(args: EventIterable, channel: IChannel) => Promise<any>> } = {};
	private _generatorMiddlewares: { [name: string]: Array<(args: EventIterable, channel: IChannel) => Promise<any>> };
	private eventMiddleware: Array<EventMiddleware>;
	private _globalChannel: IChannel<any>;
	private readonly options: CreateHubOptions;

	get generatorMiddlewares(): { [name: string]: Array<(args: EventIterable, channel: IChannel) => Promise<any>> } {
		return this._generatorMiddlewares;
	}
	private channels: _ChannelInternal[];

	get global(): IChannel {
		if (!this._globalChannel) {
			this._globalChannel = this.newChannel();
		}
		return this._globalChannel;
	}

	constructor(options: CreateHubOptions) {
		this.options = { ...defaultOptions, ...options };
		this.channels = [];
		this.eventMiddleware = this.options.eventMiddleware || [];
		this._generatorMiddlewares = { ..._HubInternal.globalGeneratorMiddlewares };
	}

	addEventMiddleware(...middleware: EventMiddleware[]): void {
		this.eventMiddleware = this.eventMiddleware.concat(middleware);
	}

	newChannel<Actions extends { [type: string]: IChannelMessage<any> } = any>(id?: string): IChannel<Actions> {
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
		for (const chann of this.channels) {
			chann.dispose();
		}
		this.channels = [];
	}

	handleSend(type: string, payload: any, sender: IChannel): any {
		if (this.options.enableLogging) {
			console.log("%cEvent:" + `%c ${type}`, "color: #0f0;font-weight:bold;", "", payload);
		}

		let currentIndex = 0;

		// first run all middleware then invoke listeners and pass result data back up the middleware
		const handleNextMiddleware = (context: EventMiddlewareContext) => {
			if (currentIndex < this.eventMiddleware.length) {
				const index = currentIndex++;
				return this.eventMiddleware[index](context, handleNextMiddleware, sender);
			} else {
				// at end. invoke listeners

				let returnData = { [channelReturnSym]: true };
				for (const chann of this.channels) {
					returnData = { ...returnData, ...chann.checkSend(context.type, context.payload) };
				}
				return returnData;
			}
		};

		return handleNextMiddleware({ type, payload });
	}

	static addGlobalGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel: IChannel) => Promise<any>): void {
		if (!_HubInternal.globalGeneratorMiddlewares[functionName]) {
			_HubInternal.globalGeneratorMiddlewares[functionName] = [];
		}

		_HubInternal.globalGeneratorMiddlewares[functionName].push(middleware);
	}

	addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel?: IChannel) => Promise<any>): void {
		if (!this._generatorMiddlewares[functionName]) {
			this._generatorMiddlewares[functionName] = [];
		}

		this._generatorMiddlewares[functionName].push(middleware);
	}

	addGlobalGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel: IChannel) => Promise<any>): void {
		_HubInternal.addGlobalGeneratorMiddleware(functionName, middleware);
	}
}

type CreateHubOptions = {
	/** Log all send events */
	enableLogging?: boolean;
	/**
	 * Tap into event pipeline by providing middleware functions. Call `next` and return the result inside the supplied function
	 * to proceed the event
	 */
	eventMiddleware?: Array<EventMiddleware>;
};

export function createHub(options?: CreateHubOptions): IHub {
	const hub = new _HubInternal(options);
	return hub as IHub;
}

export type t_HubInternal = _HubInternal;

// add default generator impls
for (const key in generatorImplements) {
	if (generatorImplements.hasOwnProperty(key)) {
		const impl = (generatorImplements as any)[key];

		_HubInternal.addGlobalGeneratorMiddleware(key, impl);
	}
}

const defaultOptions: CreateHubOptions = {};

/**
 * Same as `addGeneratorMiddleware` but adds to all future `IHub` instances in the program. Existing `IHub` instances will NOT recieve the middleware
 * @param functionName The name of this generator middleware to be added
 * @param middleware The middleware implementation that takes 1-2 args: The `EventIterable` that was yielded, in the generator, and a reference to the `IChannel` object
 */
export const addGlobalGeneratorMiddleware: IHub["addGlobalGeneratorMiddleware"] = _HubInternal.addGlobalGeneratorMiddleware;
