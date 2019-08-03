import { t_HubInternal as _HubInternal } from "./hub";
import { EventIterable } from "./generator";
import { ManualPromise } from "manual-promise";

export interface Channel<Actions extends { [type: string]: IChannelMessage<any> } = any> {
	readonly id: string;

	/**
	 * Notify all channels in the current `hub` that are listening to `type` event
	 * @param type Type of event
	 * @param data Optional data for event
	 */
	send<T extends keyof Actions>(type: T, data?: Actions[T]["payload"]): void;

	/**
	 * Listen to a given `type` of event and call `callback` whenever `type` is sent
	 * @param type Type of event to listen to
	 * @param callback Function to call whenever `type` is sent
	 */
	listen(type: string, callback: (data?: any) => any): () => void;
	/**
	 * Listen to an array of event types
	 */
	listen(type: string[], callback: (data?: any) => any): () => void;
	listen(type: string | string[], callback: (data?: any) => any): () => void;

	/**
	 * Add a listener to this channels disposal and call `func` just before being disposed
	 * @param func 
	 */
	onDispose(func: (chan?: Channel<Actions>) => void): void;

	/**
	 * Run a given generator function. @see {link:}
	 * @param generatorFunc 
	 */
	runGenerator(generatorFunc: () => IterableIterator<EventIterable>): void;
	runGenerator(generatorFunc: () => IterableIterator<EventIterable>, onCompletion?: (result?: any) => void): void;

	dispose(): void;
}

export class _ChannelInternal<Actions extends { [type: string]: IChannelMessage<any> } = any> implements Channel<Actions> {
	private onDisposes: Array<(chan?: Channel<Actions>) => void>;
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

	send<T extends keyof Actions>(type: T, data?: Actions[T]["payload"]) {
		if (this.disposed) {
			throw new Error("Channel disposed");
		}

		const returnData = this.hub.handleSend(type as any, data);
		return Object.keys(returnData).length ? returnData : null;
	}

	listen(type: string | string[], callback: (data?: any) => any) {
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

	onDispose(func: (chan?: Channel<Actions>) => void) {
		this.onDisposes.push(func);
	}

	dispose() {
		this.disposed = true;
		for (let i = 0; i < this.onDisposes.length; i++) {
			const func = this.onDisposes[i];
			func(this as Channel<Actions>);
		}
		this.onDisposes = [];
		for (let index = 0; index < this.runningGeneratorProms.length; index++) {
			const prom = this.runningGeneratorProms[index];
			if (prom instanceof ManualPromise) {
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
				const rtn = func(data);
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

			const value = this.processEventIterable(result.value.function, 0, result.value);

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
							this.processIterator(iter, data, onCompletion);
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

	processEventIterable(
		functionName: string,
		index: number,
		val: EventIterable | Promise<EventIterable>
	): EventIterable | Promise<EventIterable> {
		if (val instanceof Promise) {
			return val.then(data => {
				return this.processEventIterable(functionName, index + 1, data);
			});
		}

		for (; index < this.hub.generatorMiddlewares[functionName].length; index++) {
			const func = this.hub.generatorMiddlewares[functionName][index];
			val = func(val, this as Channel);
			if (val instanceof Promise) {
				return val.then(data => {
					return this.processEventIterable(functionName, index + 1, data);
				});
			}
		}
		return val;
	}
}

export interface IChannelMessage<D> {
	type: string;
	payload: D;
}

export function _createChannel(hub: _HubInternal, id: string) {
	return new _ChannelInternal(hub, id);
}

type Indexable<T = any> = { [x: string]: T; [x: number]: T };
