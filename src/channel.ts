import { t_HubInternal as _HubInternal } from "./hub";
import { EventIterable } from "./generator";
import { ManualPromise } from "manual-promise";
import { IChannel } from "./IChannel";
import { EventData } from "./types";

export class _ChannelInternal<Actions extends { [type: string]: IChannelMessage<any> } = any> implements IChannel<Actions> {
	private onDisposes: Array<(chan?: IChannel<Actions>) => void>;
	private listens: { [type: string]: Array<(data?: any) => any> };
	private disposed: boolean;
	private runningGeneratorProms: Promise<any>[];
	readonly id: string;

	constructor(private hub: _HubInternal, id: string) {
		this.onDisposes = [];
		this.listens = {};
		this.disposed = false;
		this.runningGeneratorProms = [];
		this.id = id;
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
		for (let index = 0; index < this.runningGeneratorProms.length; index++) {
			const prom = this.runningGeneratorProms[index];
			if (prom instanceof ManualPromise) {
				// if its a manual prom we can cancel it
				prom.reject();
			}
		}
		this.runningGeneratorProms = [];
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

	runGenerator(generatorFunc: () => IterableIterator<EventIterable>, onCompletion?: (result?: any) => void) {
		const iter = generatorFunc();
		this.processIterator(iter, null, onCompletion);
	}

	processIterator(iter: IterableIterator<EventIterable>, argument?: any, onCompletion?: (result?: any) => void) {
		let lastVal: IteratorResult<EventIterable<any>> = null;
		for (let result = (lastVal = iter.next(argument)); !result.done; result = iter.next(argument), lastVal = result) {
			argument = undefined;
			if (!result.value || !result.value.function) {
				throw new Error("Must yield a 'IterableIterator<EventIterable>' function or value");
			}

			if (
				!this.hub.generatorMiddlewares[result.value.function] ||
				this.hub.generatorMiddlewares[result.value.function].length === 0
			) {
				throw new Error(
					`'IterableIterator<EventIterable>' function '${
						result.value.function
					}' does not exist. Add middleware to 'hub.addGeneratorMiddleware'.`
				);
			}

			const value = this.processEventIterable(result.value.function, 0, result.value, result.value.value);

			if (value instanceof Promise) {
				this.runningGeneratorProms.push(value);

				let cancelled = false;
				value.then(
					data => {
						const index = this.runningGeneratorProms.indexOf(value);
						if (~index) {
							this.runningGeneratorProms.splice(index, 1);
						}
						if (!cancelled && !this.disposed) {
							this.processIterator(iter, data.value, onCompletion);
						}
					},
					err => {
						// prevent further iterations
						cancelled = true;
					}
				);
				return () => {
					cancelled = true;
				};
			} else {
				argument = value.value;
			}
		}

		if (onCompletion) {
			onCompletion(lastVal.value);
		}
	}

	processEventIterable(functionName: string, index: number, iterable: EventIterable, data: any): EventIterable | Promise<EventIterable> {
		if (data instanceof Promise) {
			return data.then(data => {
				iterable.value = data;
				return this.processEventIterable(functionName, index + 1, iterable, data);
			});
		}

		for (; index < this.hub.generatorMiddlewares[functionName].length; index++) {
			const func = this.hub.generatorMiddlewares[functionName][index];
			data = func({ ...iterable }, this as IChannel);
			if (data instanceof Promise) {
				return data.then(data => {
					iterable.value = data;
					return this.processEventIterable(functionName, index + 1, iterable, data);
				});
			} else {
				iterable.value = data;
			}
		}
		return iterable;
	}
}

export type IChannelMessage<D> = D;

export function _createChannel(hub: _HubInternal, id: string) {
	return new _ChannelInternal(hub, id);
}

type Indexable<T = any> = { [x: string]: T; [x: number]: T };
