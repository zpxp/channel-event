import { call, EventIterable, fork } from "./generator";
import { _ChannelInternal } from "./channel";

export class GeneratorBuilder implements IGeneratorBuilder {
	private generators: Array<() => IterableIterator<EventIterable>>;
	private completionCallbacks: Array<(result?: any) => void>;
	private errorCallbacks: Array<(error?: any) => void>;
	private restartAsyncError: boolean;
	private thisArgs: { thisArg: any; argArray: any[] };

	constructor(private channel: _ChannelInternal) {
		this.generators = [];
		this.completionCallbacks = [];
		this.errorCallbacks = [];
	}

	addGenerator(generatorFunc: () => IterableIterator<EventIterable>) {
		this.generators.push(generatorFunc);
		return this;
	}

	addCompletionCallback(callback: (result?: any) => void) {
		this.completionCallbacks.push(callback);
		return this;
	}

	restartOnAsyncError() {
		this.restartAsyncError = true;
		return this;
	}

	addErrorCallback(callback: (error?: any) => void) {
		this.errorCallbacks.push(callback);
		return this;
	}

	bindThis(thisArg: any, ...argArray: any[]) {
		this.thisArgs = { thisArg, argArray };
		return this;
	}

	run() {
		// remove the builder from the channel as it can no longer be configured once running has started
		this.channel.currentGeneratorBuilder = null;

		let rtnData: any[] = new Array(this.generators.length);
		const hasBinder = !!this.thisArgs;

		const onCompletion = (index: number) => {
			return (data: any) => {
				rtnData[index] = data;
				this.generators[index] = null;
				if (this.generators.every(x => x === null)) {
					// all done. invoke completion callbacks
					if (this.generators.length === 1) {
						//pass as a single object
						this.completionCallbacks.forEach(x => x(rtnData[0]));
					} else {
						// pass all data
						this.completionCallbacks.forEach(x => x(rtnData));
					}
				}
			};
		};

		if (this.restartAsyncError) {
			for (let index = 0; index < this.generators.length; index++) {
				const generator = hasBinder
					? this.generators[index].bind(this.thisArgs.thisArg, ...this.thisArgs.argArray)
					: this.generators[index];

				try {
					this.channel.runGenerator(tryFork(generator, onCompletion(index)), null, err => {
						this.errorCallbacks.forEach(x => x(err));
					});
				} catch (e) {
					if (this.errorCallbacks.length) {
						this.errorCallbacks.forEach(x => x(e));
					} else {
						throw e;
					}
				}
			}
		} else {
			for (let index = 0; index < this.generators.length; index++) {
				const generator = hasBinder
					? this.generators[index].bind(this.thisArgs.thisArg, ...this.thisArgs.argArray)
					: this.generators[index];

				try {
					this.channel.runGenerator(generator, onCompletion(index), err => {
						if (this.errorCallbacks.length) {
							this.errorCallbacks.forEach(x => x(err));
						} else {
							throw err;
						}
					});
				} catch (e) {
					if (this.errorCallbacks.length) {
						this.errorCallbacks.forEach(x => x(e));
					} else {
						throw e;
					}
				}
			}
		}
	}
}

export interface IGeneratorBuilder {
	/**
	 * Invoke all added generators
	 */
	run(): void;

	/**
	 * Add a generator function to the current configuration to be invoked when `IGeneratorBuilder.run` is called
	 * @param generatorFunc Generator function to invoke
	 */
	addGenerator(generatorFunc: (...args: any[]) => IterableIterator<EventIterable>): IGeneratorBuilder;

	/**
	 * Add a callback function to invoke when all generators are run to completion
	 * @param callback Function to invoke when all added generators are run to completion. If more than one generetor is added, then `result` will be an array
	 */
	addCompletionCallback(callback: (result?: any | any[]) => void): IGeneratorBuilder;

	/**
	 * Add a callback function to invoke whenever a generator throws an uncaught exception
	 * @param callback
	 */
	addErrorCallback(callback: (error?: any) => void): IGeneratorBuilder;

	/**
	 * For all given generator functions, bind `thisArg` to the value of `this` and optionally has the specified initial parameters.
	 * Subsequent calls to this function will override previous calls for this `IGeneratorBuilder` instance
	 * @param thisArg An object to which the this keyword can refer inside all the generator functions.
	 * @param argArray A list of arguments to be passed to all the generator functions.
	 */
	bindThis(thisArg: any, ...argArray: any[]): IGeneratorBuilder;

	/**
	 * Restart generators when they throw an async error. An async error is any error after the current stack frame. Sync errors are not caught because restarting on sync errors
	 * would result in infinite loops
	 */
	restartOnAsyncError(): IGeneratorBuilder;
}

function tryFork(generator: () => IterableIterator<EventIterable>, callback: (data: any) => void) {
	function* runner() {
		let isSyncError = false;
		while (!isSyncError) {
			isSyncError = true;
			try {
				setTimeout(() => (isSyncError = false));
				const result = yield call(generator);
				// ran to completion
				callback(result);
				return;
			} catch (e) {
				console.error("Generator Error:", e);
				if (isSyncError) {
					throw e;
				}
			}
		}
	}

	return function* retryOnError(): IterableIterator<EventIterable> {
		yield fork(runner);
	};
}
