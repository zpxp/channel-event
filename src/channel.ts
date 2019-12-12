import { t_HubInternal as _HubInternal } from "./hub";
import { EventIterable } from "./generator";
import { IChannel } from "./IChannel";
import { EventData } from "./types";
import { GeneratorBuilder, IGeneratorBuilder } from "./generatorBuilder";
import { IterRunner } from "./runner";
import { IHub } from "./IHub";

export class _ChannelInternal<Actions extends { [type: string]: IChannelMessage<any> } = any> implements IChannel<Actions> {
	private onDisposes: Array<(chan?: IChannel<Actions>) => void>;
	private listens: { [type: string]: Array<(data?: any) => any> };
	private disposed: boolean;
	readonly id: string;

	currentGeneratorBuilder: GeneratorBuilder;

	constructor(private _hub: _HubInternal, id: string) {
		this.onDisposes = [];
		this.listens = {};
		this.disposed = false;
		this.id = id;
	}

	get generator(): IGeneratorBuilder {
		// hold a reference to the current builder object until the user calls GeneratorBuilder.run.
		// once run is called, currentGeneratorBuilder is set to null so a new GeneratorBuilder instance is
		// created when accessing this property
		if (!this.currentGeneratorBuilder) {
			this.currentGeneratorBuilder = new GeneratorBuilder(this);
		}
		return this.currentGeneratorBuilder;
	}

	get isDisposed() {
		return this.disposed;
	}

	get hub(): IHub {
		return this._hub;
	}

	send<T extends keyof Actions>(type: T, data?: Actions[T]) {
		if (this.disposed) {
			throw new Error("Channel disposed");
		}

		const returnData = this._hub.handleSend(type as string, data, this as IChannel);
		// if return data contians the internal member __CHANNEL_RTN then its a dictionary of return values from listeners
		if (returnData && "__CHANNEL_RTN" in returnData) {
			// is a standard return object dictionary
			// remove dictoinary marker member
			delete returnData.__CHANNEL_RTN;
			// only return the object if one or more listeners returned data otherwise return null
			return Object.keys(returnData).length ? returnData : null;
		} else {
			// data returned is not something we recognise, just return it. It was overriden in event middleware
			return returnData;
		}
	}

	listen(type: string | string[], callback: (data?: EventData) => any) {
		if (this.disposed) {
			throw new Error("Channel disposed");
		}
		if (!callback) {
			throw new Error("callback missing");
		}
		if (!type) {
			throw new Error("type missing");
		}

		if (Array.isArray(type)) {
			for (let index = 0; index < type.length; index++) {
				const t = type[index];
				if (!this.listens[t]) {
					this.listens[t] = [];
				}
				this.listens[t].push(callback);
			}
			const dispose = () => {
				for (let index = 0; index < type.length; index++) {
					const t = type[index];
					const i = this.listens[t].indexOf(callback);
					if (~i) {
						this.listens[t].splice(i, 1);
					}
				}
			};
			this.onDispose(dispose);
			return dispose;
		} else {
			if (!this.listens[type]) {
				this.listens[type] = [];
			}
			this.listens[type].push(callback);
			const dispose = () => {
				const i = this.listens[type].indexOf(callback);
				if (~i) {
					this.listens[type].splice(i, 1);
				}
			};
			this.onDispose(dispose);
			return dispose;
		}
	}

	onDispose(func: (chan?: IChannel<Actions>) => void) {
		this.onDisposes.push(func);
	}

	dispose() {
		this.disposed = true;
		for (let i = 0; i < this.onDisposes.length; i++) {
			const func = this.onDisposes[i];
			func(this as IChannel<Actions>);
		}
		this.onDisposes = [];
	}

	checkSend(type: string, data: any) {
		let rnts: Indexable = {};
		if (type in this.listens) {
			for (let index = this.listens[type].length - 1; index >= 0; index--) {
				const func = this.listens[type][index];
				const rtn = func({ type, payload: data });
				if (this.id && rtn !== undefined) {
					rnts[this.id] = rtn;
				}
			}
		}
		return rnts;
	}

	runGenerator(
		generatorFunc: () => IterableIterator<EventIterable>,
		onCompletion?: (result?: any) => void,
		onError?: (error: any) => void
	): () => void {
		const iter = generatorFunc();
		return this.runIterator(iter, onCompletion, onError);
	}

	/** Returns a cancel function */
	runIterator(iter: IterableIterator<EventIterable>, onCompletion?: (result?: any) => void, onError?: (error: any) => void): () => void {
		if (this.disposed) {
			throw new Error("Channel disposed");
		}

		const runner = new IterRunner(iter, this, this._hub);
		runner.run(onCompletion, onError);
		return runner.cancel;
	}
}

export type IChannelMessage<D> = D;

export function _createChannel(hub: _HubInternal, id: string) {
	return new _ChannelInternal(hub, id);
}

type Indexable<T = any> = { [x: string]: T; [x: number]: T };
