import { _createChannel, _ChannelInternal, IChannelMessage } from "./channel";
import { EventIterable } from "./generator";
import { generatorImplements } from "./generatorImpls";
import { IHub } from "./IHub";
import { IChannel } from "./IChannel";

class _HubInternal implements IHub {
	static generatorMiddlewares: { [name: string]: Array<(args: EventIterable, channel: IChannel) => Promise<any>> } = {};
	private _globalChannel: IChannel<any>;
	private readonly options: { enableLogging?: boolean };

	get generatorMiddlewares() {
		return _HubInternal.generatorMiddlewares;
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
		for (let index = 0; index < this.channels.length; index++) {
			const chann = this.channels[index];
			chann.dispose();
		}
		this.channels = [];
	}

	handleSend(type: string, data: any) {
		if (this.options.enableLogging) {
			console.log("%cEvent:" + `%c ${type}`, "color: #0f0;font-weight:bold;", "", data);
		}

		let returnData = {};
		for (let index = 0; index < this.channels.length; index++) {
			const chann = this.channels[index];
			returnData = { ...returnData, ...chann.checkSend(type, data) };
		}
		return returnData;
	}

	static addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel: IChannel) => Promise<any>): void {
		if (!_HubInternal.generatorMiddlewares[functionName]) {
			_HubInternal.generatorMiddlewares[functionName] = [];
		}

		_HubInternal.generatorMiddlewares[functionName].push(middleware);
	}

	addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel: IChannel) => Promise<any>): void {
		_HubInternal.addGeneratorMiddleware(functionName, middleware);
	}
}

type CreateHubOptions = {
	/** Log all send events */
	enableLogging?: boolean;
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

		_HubInternal.addGeneratorMiddleware(key, impl);
	}
}

const defaultOptions: CreateHubOptions = {};
