import { EventIterable } from "./generator";
import { GeneratorUtils } from "./utils";
import { IChannel } from "./IChannel";
import { _ChannelInternal } from "./channel";
import { t_HubInternal } from "./hub";

export class IterRunner {
	private iterStack: Array<IterableIterator<EventIterable>>;
	private cancelled: boolean;

	constructor(iter: IterableIterator<EventIterable>, private channel: _ChannelInternal, private hub: t_HubInternal) {
		this.iterStack = [iter];
		this.cancel = this.cancel.bind(this);
		this.run = this.run.bind(this);
	}

	run(onCompletion?: (result?: any) => void, onError?: (error: any) => void): IterRunner {
		this.doRun(undefined, onCompletion, onError);
		return this;
	}

	cancel() {
		this.cancelled = true;
	}

	private doRun(argument?: any, onCompletion?: (result?: any) => void, onError?: (error: any) => void) {
		if (!this.cancelled) {
			if (this.iterStack.length > 0) {
				const iter = this.iterStack[this.iterStack.length - 1];
				try {
					const val = this.next(iter, argument);
					this.handleIterValue(val, onCompletion, onError);
				} catch (err) {
					const val = this.handleIterError(err);
					this.handleIterValue(val, onCompletion, onError);
				}
			} else {
				onCompletion && onCompletion(argument);
			}
		}
	}

	private handleIterValue(val: any, onCompletion?: (result?: any) => void, onError?: (error: any) => void) {
		if (val instanceof Promise) {
			val.then(val => {
				this.doRun(val, onCompletion, onError);
			}).catch(err => {
				const val = this.handleIterError(err);
				this.handleIterValue(val, onCompletion, onError);
			});
		} else {
			this.doRun(val, onCompletion, onError);
		}
	}

	private next(iter: IterableIterator<EventIterable>, argument?: any) {
		if (this.cancelled) {
			return;
		}

		const result = iter.next(argument);

		if (result.done) {
			this.iterStack.pop();
			return result.value;
		} else {
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

			const value = this.processEventIterable(result.value, 0);

			if (value instanceof Error) {
				return this.handleIterError(value);
			} else {
				return value;
			}
		}
	}

	private handleIterError(err: Error): EventIterable | Promise<any> {
		if (this.iterStack.length > 0) {
			const iter = this.iterStack[this.iterStack.length - 1];
			try {
				const nextYieldResult = iter.throw(err);
				if (
					nextYieldResult &&
					GeneratorUtils.isIteratorResult(nextYieldResult) &&
					!nextYieldResult.done &&
					GeneratorUtils.isEventIterable(nextYieldResult.value)
				) {
					const value = this.processEventIterable(nextYieldResult.value, 0);
					if (value instanceof Error) {
						return this.handleIterError(value);
					} else {
						return value;
					}
				} else {
					throw err;
				}
			} catch (e) {
				// the current iter cannot handle the error. propogate up
				this.iterStack.pop();
				return this.handleIterError(err);
			}
		} else {
			throw err;
		}
	}

	private processEventIterable(iterable: EventIterable, index: number): any | Promise<any> {
		if (GeneratorUtils.isIterableIterator(iterable.value)) {
			this.iterStack.push(iterable.value);
			return this.next(iterable.value);
		} else if (iterable.value instanceof Promise) {
			// value is a promise. wait till completion
			return iterable.value.then(data => {
				iterable.value = data;
				return this.processEventIterable(iterable, index);
			});
		}

		if (index < this.hub.generatorMiddlewares[iterable.function].length) {
			const func = this.hub.generatorMiddlewares[iterable.function][index];
			const data = func({ ...iterable }, this.channel as IChannel);

			iterable.value = data;
			return this.processEventIterable(iterable, index + 1);
		} else {
			return iterable.value;
		}
	}
}
