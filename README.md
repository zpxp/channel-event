# channel-event

A simple javascript event channel library that can run generator functions, allows async data flows and enables cross component communication.
Events are scoped to hub instances which means that the scale of the event channels can be controlled and event collisions are non existant. Events can be easily debugged via this scoping and built in logging. 

![Bundlephobia gzip + minified](https://badgen.net/bundlephobia/minzip/channel-event)

Typescript typings are built in, however it will still work in vanila javascript 

### Installation

`yarn add channel-event`

`npn install channel-event`


### Use 

- [Fiddle](https://jsfiddle.net/dgf29k1n/)

First, create a hub

``` tsx
import { createHub } from "channel-event";

const hub = createHub({ enableLogging: process.env.NODE_ENV === "development" });
```

Then, create a channel. All channels created will be able to communicate with all other channels created by the same hub. Channels created by different hubs will not be able to communicate.
If a channel is created with an id, that channel may return values from `listen` and those values will be returned to the sender channel in a dictionary `{ [channelId]: value }`. Multiple channels can return values to a single sender, as long as their ids differ.

``` tsx
const channel = hub.newChannel();
const channel2 = hub.newChannel("channel id");

channel2.listen("test", data => {
   console.log(data); // -> { type: "test", payload: 10 }
   // since this channel was created with an id passed to newChannel
   // we can return a value here
   return true;
});

const result = channel.send("test", 10);
console.log(result); // -> { "channel id": true }
```

Generator functions allow for reusable async logic. See [Generator actions](#generator-actions) for more generator actions.

``` tsx
function* test(): IterableIterator<EventIterable> {
   for (let count = 0; count < 10; count++) {
      // `put` is the equivelent of channel.send, called on the current channel
      yield put("test", count);
      // sleep for 200 ms
      yield delay(200);
   }
}

function* check(): IterableIterator<EventIterable> {
   for (let index = 0; index < 10; index++) {
      // `take` blocks until the specified event is 
      // sent within the context of the current hub
      const count = yield take("test");
      console.log(count);
   }
   console.log("done!");
}

// regular listen will pick up events sent from `put`
channel.listen("test", data => {
   console.log(data); // -> { type: "test", payload: <value of count> }
});

// this will print out the numbers 0-9 with 200 ms delays between prints
channel.generator
   .addGenerator(check)
   .addGenerator(test)
   .restartOnAsyncError()
   .run();
```

Call `dispose` when finished using

``` tsx 
channel.dispose();
// or
hub.dispose(); // calls dispose on every channel inside the hub
```

### Event middleware

Middleware can be added to the event chain to change the fundamental behaviour of events. Event middleware is added to the hub with `addEventMiddleware`.
See https://github.com/zpxp/channel-store for an example of event middleware.

``` tsx
hub.addEventMiddleware((context, next) => {
   // log all events
   console.log(context.type);
   return next(context);
})

hub.addEventMiddleware((context, next) => {
   next(context);
   // override the return value from listens
   // channel.send(...) will now always return 42
   return 42;
})
```

### Generator middleware

New generator actions can be defined by calling `IHub.addGlobalGeneratorMiddleware` or `static IHub.addGlobalGeneratorMiddleware`. The static function will add the new middleware to all future instances of `IHub`, while the instance function will only add the middleware to that hub instance. Whenever a generator `yield`s an `EventIterable`, the hub will look for
any middleware whos function name matches the `EventIterable.function`.

Generator middleware takes 2 arguments, the first contains all the arguments that the yielded function was called with, the second is the `IChannel` instance.
Middleware must return a `Promise`, that when resolved, will return the resolved data from the `yield` statement.

``` tsx
export function pow(power: number): EventIterable {
   return {
      function: "power",
      value: { power: power }
   };
}


hub.addGeneratorMiddleware("power", function(data: EventIterable<{ power: number }>, channel: IChannel): Promise<any> {
   return Promise.resolve(Math.pow(42, data.value.power));
});

// the action can now be used like this
channel.runGenerator(function*(): IterableIterator<EventIterable> {
   const num = yield pow(2);
   console.log(num); // -> 1764
});
```

NOTE: If the promised returned from the generator middleware implementation is pending, it is a good idea to add the `reject` function to the `channel.onDispose` function to prevent hanging promises

``` tsx
hub.addGeneratorMiddleware("take", function(data: EventIterable<string | string[]>, channel: IChannel): Promise<any> {
   return new Promise((resolve, reject) => {
      const unsub = channel.listen(data.value, result => {
unsub();
resolve(result);
      });
      // call reject when channel is disposed
      channel.onDispose(reject);
   });
});
```

### Generator actions

Current available actions implemented in all hub instances

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

### Extensions, middleware

Library | Description
--- | ---
 [channel-store](https://github.com/zpxp/channel-store) | An event middleware that creates an ambient state for channel hubs that can be accessed anywhere that a channel exists
 [react-channel-event](https://github.com/zpxp/react-channel-event) | A react provider and HoC wrapper for `channel-event`
 [react-channel-store](https://github.com/zpxp/react-channel-store) | A react provider and HoC wrapper for `channel-store`


