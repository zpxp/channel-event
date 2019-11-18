import { EventData } from "./types";

export interface EventIterable<T = any> {
	function: string;
	value: T;
}

/**
 * waits until the dispatch of a specified type then returns the data
 * @param type the string type or types to wait on
 */
export function take(type: string | string[]): EventIterable {
	return {
		function: "take",
		value: type
	};
}

/**
 * Calls `channel.send` on the current hub
 * @param type action type
 * @param data optional data to send to all listeners
 */
export function put<Actions extends { [type: string]: any } = any, T extends keyof Actions = keyof Actions>(
	type: T,
	data?: Actions[T]
): EventIterable {
	return {
		function: "put",
		value: { type, data }
	};
}

/**
 * Calls an async func (promise) or generator func and waits until its completion, returning
 * the result
 * @param func async func (promise) or generator function
 * @param args
 */
export function call<A extends any[]>(func: (...args: A) => any, ...args: A): EventIterable {
	return {
		function: "call",
		value: { func, args }
	};
}

/**
 * Same as `call` except does not block until the function returns. Returns a cancel function that will cancel the forked task
 * @param func plain function, async func (promise) or generator function
 * @param args
 */
export function fork<A extends any[]>(func: (...args: A) => any, ...args: A): EventIterable {
	return {
		function: "fork",
		value: { func, args }
	};
}

/**
 * Blocks for the given ms duration
 * @param durationMs
 */
export function delay(durationMs: number): EventIterable {
	return {
		function: "delay",
		value: durationMs
	};
}

/**
 * Call `func` whenever `type` is dispatched. Cancels any existing instances `func` that may be running
 * @param type Call func whenever this type is dispatched
 * @param func
 */
export function takeLatest<Actions extends { [type: string]: any } = any, T extends keyof Actions = keyof Actions>(
	type: T | T[],
	func: (data?: EventData<Actions[T]>) => IterableIterator<EventIterable>
): EventIterable {
	return {
		function: "takeLatest",
		value: { type, func }
	};
}

/**
 * Call `func` whenever `type` is dispatched.
 * @param type Call func whenever this type is dispatched
 * @param func
 */
export function takeEvery<Actions extends { [type: string]: any } = any, T extends keyof Actions = keyof Actions>(
	type: T | T[],
	func: (data?: EventData<Actions[T]>) => IterableIterator<EventIterable>
): EventIterable {
	return {
		function: "takeEvery",
		value: { type, func }
	};
}

/**
 * Call `func` whenever `type` is dispatched if no instances of `func` are running
 * @param type Call func whenever this type is dispatched
 * @param func
 */
export function takeLast<Actions extends { [type: string]: any } = any, T extends keyof Actions = keyof Actions>(
	type: T | T[],
	func: (data?: EventData<Actions[T]>) => IterableIterator<EventIterable>
): EventIterable {
	return {
		function: "takeLast",
		value: { type, func }
	};
}
