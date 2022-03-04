import { call, EventIterable, fork, delay } from "./generator";
import { _ChannelInternal } from "./channel";

export class GeneratorBuilder implements IGeneratorBuilder {
	private generators: Array<(...args: any[]) => Generator<EventIterable, any, any>>;
	private completionCallbacks: Array<(result?: any) => void>;
	private errorCallbacks: Array<(error?: any) => void>;
	private restartAsyncError: boolean;
	private thisArgs: { thisArg: any; argArray: any[] };
	private restartMsTimeout: number;

	constructor(private channel: _ChannelInternal) {
		this.generators = [];
		this.completionCallbacks = [];
		this.errorCallbacks = [];
	}

	addGenerator(generatorFunc: () => Generator<EventIterable, any, any>) {
		this.generators.push(generatorFunc);
		return this;
	}

	addCompletionCallback(callback: (result?: any) => void) {
		this.completionCallbacks.push(callback);
		return this;
	}

	restartOnAsyncError(msTimeout?: number) {
		this.restartAsyncError = true;
		this.restartMsTimeout = msTimeout;
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
		const cancellers: Array<() => void> = [];

		const rtnData: any[] = new Array(this.generators.length);
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
					const canceller = this.channel.runGenerator(
						tryFork(generator, this.restartMsTimeout, onCompletion(index)),
						null,
						err => {
							this.errorCallbacks.forEach(x => x(err));
						}
					);
					cancellers.push(canceller);
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
					const canceller = this.channel.runGenerator(generator, onCompletion(index), err => {
						if (this.errorCallbacks.length) {
							this.errorCallbacks.forEach(x => x(err));
						} else {
							throw err;
						}
					});
					cancellers.push(canceller);
				} catch (e) {
					if (this.errorCallbacks.length) {
						this.errorCallbacks.forEach(x => x(e));
					} else {
						throw e;
					}
				}
			}
		}

		return () => {
			// cancel function
			for (const canceller of cancellers) {
				canceller();
			}
		};
	}
}

export interface IGeneratorBuilder {
	/**
	 * Invoke all added generators. Returns a function that when invoked, cancels all running generators
	 */
	run(): () => void;

	/**
	 * Add a generator function to the current configuration to be invoked when `IGeneratorBuilder.run` is called
	 * @param generatorFunc Generator function to invoke
	 */
	addGenerator(generatorFunc: (...args: any[]) => Generator<EventIterable, any, any>): IGeneratorBuilder;

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
	 * @param msTimeout Restart failed generators after a timeout. Defaults to zero
	 */
	restartOnAsyncError(msTimeout?: number): IGeneratorBuilder;
}

function tryFork<T = any>(generator: () => Generator<EventIterable, T, any>, msTimeout: number, callback: (data: any) => void) {
	function* runner() {
		let isSyncError = false;
		while (!isSyncError) {
			isSyncError = true;
			try {
				// eslint-disable-next-line no-loop-func
				setTimeout(() => (isSyncError = false));
				const result: T = yield call(generator);
				// ran to completion
				callback(result);
				return;
			} catch (e) {
				console.error("Generator Error:", e);
				if (isSyncError) {
					throw e;
				} else if (msTimeout && msTimeout > 0) {
					// restart after amount of time
					yield delay(msTimeout);
				}
			}
		}
	}

	return function* retryOnError(): Generator<EventIterable, any, any> {
		yield fork(runner);
	};
}
