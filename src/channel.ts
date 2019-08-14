import { t_HubInternal as _HubInternal } from "./hub";
import { EventIterable } from "./generator";
import { IChannel } from "./IChannel";
import { EventData } from "./types";
import { GeneratorBuilder, IGeneratorBuilder } from "./generatorBuilder";
import { IterRunner } from "./runner";

export class _ChannelInternal<Actions extends { [type: string]: IChannelMessage<any> } = any> implements IChannel<Actions> {
	private onDisposes: Array<(chan?: IChannel<Actions>) => void>;
	private listens: { [type: string]: Array<(data?: any) => any> };
	private disposed: boolean;
	readonly id: string;

	constructor(private hub: _HubInternal, id: string) {
		this.onDisposes = [];
		this.listens = {};
		this.disposed = false;
		this.id = id;
	}

	get generator(): IGeneratorBuilder {
		return new GeneratorBuilder(this);
	}

	send<T extends keyof Actions>(type: T, data?: Actions[T]) {
		if (this.disposed) {
			throw new Error("Channel disposed");
		}

		const returnData = this.hub.handleSend(type as string, data, this as IChannel);
		if (returnData && "__CHANNEL_RTN" in returnData) {
			// is a standard return object dictionary
			// remove dictoinary marker member
			delete returnData.__CHANNEL_RTN;
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

	runIterator(iter: IterableIterator<EventIterable>, onCompletion?: (result?: any) => void, onError?: (error: any) => void): () => void {
		const runner = new IterRunner(iter, this, this.hub);
		runner.run(onCompletion, onError);
		return runner.cancel;
	}
}

export type IChannelMessage<D> = D;

export function _createChannel(hub: _HubInternal, id: string) {
	return new _ChannelInternal(hub, id);
}

type Indexable<T = any> = { [x: string]: T; [x: number]: T };
