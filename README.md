# channel-event

A simple javascript event channel library that can run generator functions, that allows for async data flows and cross component communication


### Installation

`yarn add channel-event`

`npn install channel-event`



### Generator actions

``` ts

/**
 * waits until the dispatch of a specified type then returns the data
 * @param type the string type or types to wait on
 */
export declare function take(type: string | string[]): EventIterable;

/**
 * Calls `channel.send` on the current hub
 * @param type action type
 * @param data optional data to send to all listeners
 */
export declare function put(type: string, data?: any): EventIterable;

/**
 * Calls an async func (promise) or generator func and waits until its completion, returning
 * the result
 * @param func async func (promise) or generator function
 * @param args
 */
export declare function call<A extends any[]>(func: (...args: A) => any, ...args: A): EventIterable;

/**
 * Same as `call` except does not block until the function returns. Returns a cancel function that will cancel the forked task
 * @param func plain function, async func (promise) or generator function
 * @param args
 */
export declare function fork<A extends any[]>(func: (...args: A) => any, ...args: A): EventIterable;

/**
 * Blocks for the given ms duration
 * @param durationMs
 */
export declare function delay(durationMs: number): EventIterable;

/**
 * Call `func` whenever `type` is dispatched. Cancels any existing instances `func` that may be running
 * @param type Call func whenever this type is dispatched
 * @param func
 */
export declare function takeLatest(type: string | string[], func: (data?: any) => IterableIterator<EventIterable>): EventIterable;

/**
 * Call `func` whenever `type` is dispatched.
 * @param type Call func whenever this type is dispatched
 * @param func
 */
export declare function takeEvery(type: string | string[], func: (data?: any) => IterableIterator<EventIterable>): EventIterable;

/**
 * Call `func` whenever `type` is dispatched if no instances of `func` are running
 * @param type Call func whenever this type is dispatched
 * @param func
 */
export declare function takeLast(type: string | string[], func: (data?: any) => IterableIterator<EventIterable>): EventIterable;


```