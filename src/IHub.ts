import { IChannel } from "./IChannel";
import { EventIterable } from "./generator";
import { IChannelMessage } from "./channel";

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
	 * @param functionName The name of this generator middleware to be added
	 * @param middleware The middleware implementation that takes 1-2 args: The `EventIterable` that was yielded, in the generator, and a reference to the `IChannel` object
	 */
	addGeneratorMiddleware(functionName: string, middleware: (args: EventIterable, channel?: IChannel) => Promise<any>): void;

	/**
	 * A static instance of a `IChannel` that sits on this hub
	 */
	global: IChannel;

	/**
	 * Cleanup any channels and dispose this hub
	 */
	dispose(): void;
}