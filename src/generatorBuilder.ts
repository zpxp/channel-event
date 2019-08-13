import { call, EventIterable, fork } from "./generator";
import { _ChannelInternal } from "./channel";

export class GeneratorBuilder implements IGeneratorBuilder {
	private generators: Array<() => IterableIterator<EventIterable>>;
	private completionCallbacks: Array<(result?: any) => void>;
	private restartAsyncError: boolean;

	constructor(private channel: _ChannelInternal) {
		this.generators = [];
		this.completionCallbacks = [];
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

	run() {
		let rtnData: any[] = new Array(this.generators.length);

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
				const generator = this.generators[index];
				this.channel.runGenerator(tryFork(generator, onCompletion(index)));
			}
		} else {
			for (let index = 0; index < this.generators.length; index++) {
				const generator = this.generators[index];
				const iter = generator();
				this.channel.processIterator(iter, null, onCompletion(index));
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
	addGenerator(generatorFunc: () => IterableIterator<EventIterable>): IGeneratorBuilder;

	/**
	 * Add a acallback function to invoke when all generators are run to completion
	 * @param callback Function to invoke when all added generators are run to completion. If more than one generetor is added, then `result` will be an array
	 */
	addCompletionCallback(callback: (result?: any | any[]) => void): IGeneratorBuilder;

	/**
	 * Restart generators when they throw an async error. An async error is any error after the current stack frame. Sync errors are not caught becuase restarting on sync errors
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
