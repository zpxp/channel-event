import { IChannel } from "./IChannel";
import { EventIterable } from "./generator";
import { IChannelMessage } from "./channel";
import { EventMiddleware } from "./types";

export interface IHub {
	/**
	 * Create a new channel inside this hub. A channel broadcasts events to all other channels inside the same hub.
	 *
	 * If `id` is specified, then channals can return data in the `IChannel.listen` function that will be sent back to the channel
	 * that called `send`
	 *
	 * @param id An optional channel id. Allows two way event communication
	 */
	newChannel<Actions extends { [type: string]: IChannelMessage<any> } = any>(id?: string): IChannel<Actions>;

	/**
	 * Add a custom generator middleware to the event channel generator. Whenever a generator `yield`s an `EventIterable`, the hub will look for
	 * any middleware whos function name matches the `EventIterable.function`.
	 *
	 * Generator middleware takes 2 arguments, the first contains all the arguments that the yielded function was called with, the second is the `IChannel` instance.
	 * Middlware must return a `Promise`, that when resolved, will return the resolved data from the `yield` statement.
	 *
	 * 		hub.addGeneratorMiddleware("put", function(data: EventIterable<{ type: string; data: any }>, channel: IChannel): Promise<any> {
	 * 			return Promise.resolve(channel.send(data.value.type, data.value.data));
	 * 		});
	 *
	 *
	 * @param functionName The name of this generator middleware to be added
	 * @param middleware The middleware implementation that takes 1-2 args: The `EventIterable` that was yielded, in the generator, and a reference to the `IChannel` object
	 */
	addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel?: IChannel) => Promise<any>): void;

	/**
	 * Same as `addGeneratorMiddleware` but adds to all future `IHub` instances in the program. Existing `IHub` instances will NOT recieve the middleware
	 * @param functionName The name of this generator middleware to be added
	 * @param middleware The middleware implementation that takes 1-2 args: The `EventIterable` that was yielded, in the generator, and a reference to the `IChannel` object
	 */
	addGlobalGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel?: IChannel) => Promise<any>): void;

	/**
	 * A static instance of a `IChannel` that sits on this hub
	 */
	global: IChannel;

	/**
	 * Tap into event pipeline by providing middleware functions. All calls to `send` or `put` will result in event middleware running.
	 * Call `next` and return the result inside the supplied function to proceed the event.
	 * Middleware is run in the order of adding to the hub.
	 *
	 * 	hub.addEventMiddleware((context, next) => {
	 * 		// log all events
	 * 		console.log(context.type);
	 * 		return next(context);
	 * 	})
	 *
	 * @param middleware
	 */
	addEventMiddleware(middleware: EventMiddleware): void;
	addEventMiddleware(middleware: EventMiddleware, ...additionalMiddleware: EventMiddleware[]): void;

	/**
	 * Cleanup any channels and dispose this hub
	 */
	dispose(): void;
}
