import { EventIterable, take, call, fork, takeEvery } from "./generator";
import { _ChannelInternal as tChannel } from "./channel";
import { GeneratorUtils } from "./utils";
import { IChannel } from "./IChannel";

export const generatorImplements = {
	/**
	 * waits untill the dispatch of a specified type then resolves with the data
	 * @param data the string type or types to wait on
	 * @param channel
	 */
	take: function(data: EventIterable<string | string[]>, channel: IChannel): Promise<any> {
		return new Promise((resolve, reject) => {
			const unsub = channel.listen(data.value, result => {
				unsub();
				resolve(result);
			});
			channel.onDispose(reject);
		});
	},

	/**
	 * Calls `channel.send` on the current hub
	 * @param data action type and data to send
	 * @param channel
	 */
	put: function(data: EventIterable<{ type: string; data: any }>, channel: IChannel): Promise<any> {
		return Promise.resolve(channel.send(data.value.type, data.value.data));
	},

	/**
	 * Calls an async func (ManualPromise) or generator func and waits until its completion
	 * @param data async func or generator
	 * @param channel
	 */
	call: function<A extends any[]>(data: EventIterable<{ func: (...args: A) => any; args: A }>, channel: tChannel): Promise<any> {
		const result = data.value.func.apply(null, data.value.args);
		return Promise.resolve(result);
	},

	fork: function<A extends any[]>(data: EventIterable<{ func: (...args: A) => any; args: A }>, channel: tChannel): Promise<any> {
		let cancel: (reason: any) => void;
		let cancelled = false;

		//wrap in timout so the code in the fork is not run instantly
		setTimeout(() => {
			if (!cancelled) {
				const result = data.value.func.apply(null, data.value.args);
				if (GeneratorUtils.isIterableIterator(result)) {
					// save cb to internal cancel func
					cancel = channel.runIterator(result);
				}
			}
		});

		return Promise.resolve((reason?: any) => {
			cancelled = true;
			if (cancel) {
				cancel(reason);
			}
		});
	},

	delay: function(data: EventIterable<number>, channel: IChannel): Promise<never> {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, data.value);
		});
	},

	takeLatest: function(
		data: EventIterable<{ type: string | string[]; func: (data: any) => void | IterableIterator<EventIterable> }>,
		channel: IChannel
	): Promise<any> {
		channel.runGenerator(function*() {
			let cancel = null;
			while (true) {
				const result = yield take(data.value.type);
				if (cancel) {
					cancel();
					cancel = null;
				}
				cancel = yield fork(data.value.func, result);
			}
		});

		return Promise.resolve();
	},

	takeEvery: function(
		data: EventIterable<{ type: string | string[]; func: (data: any) => void | IterableIterator<EventIterable> }>,
		channel: IChannel
	): Promise<any> {
		channel.runGenerator(function*() {
			while (true) {
				const result = yield take(data.value.type);
				yield fork(data.value.func, result);
			}
		});

		return Promise.resolve();
	},

	takeLast: function(
		data: EventIterable<{ type: string | string[]; func: (data: any) => void | IterableIterator<EventIterable> }>,
		channel: IChannel
	): Promise<any> {
		channel.runGenerator(function*() {
			while (true) {
				const result = yield take(data.value.type);
				// block until completion
				yield call(data.value.func, result);
			}
		});

		return Promise.resolve();
	}
};
