import { t_HubInternal as _HubInternal } from "./hub";
import { EventIterable } from "./generator";
import { IChannelMessage } from "./channel";
import { EventData } from "./types";

export interface IChannel<Actions extends { [type: string]: IChannelMessage<any> } = any> {
	readonly id: string;

	/**
	 * Notify all channels in the current `IHub` that are listening to `type` event
	 * @param type Type of event
	 * @param data Optional data for event
	 */
	send<T extends keyof Actions>(type: T, data?: Actions[T]): any;

	/**
	 * Listen to a given `type` of event and call `callback` whenever `type` is sent
	 * @param type Type of event to listen to
	 * @param callback Function to call whenever `type` is sent
	 */
	listen<T extends keyof Actions>(type: T, callback: (data?: EventData<Actions[T], T>) => any): () => void;
	/**
	 * Listen to an array of event types
	 */
	listen<T extends keyof Actions>(type: T[], callback: (data?: EventData<Actions[T], T>) => any): () => void;
	listen<T extends keyof Actions>(type: T | T[], callback: (data?: EventData<Actions[T], T>) => any): () => void;

	/**
	 * Add a listener to this channels disposal and call `func` just before being disposed
	 * @param func
	 */
	onDispose(func: (chan?: IChannel<Actions>) => void): void;

	/**
	 * Run a given generator function.
	 *
	 * @see https://github.com/zpxp/channel-event/blob/v1/src/generator.ts
	 * @see https://github.com/zpxp/channel-event/blob/v1/src/__tests__/events.ts#L102
	 * @param generatorFunc
	 */
	runGenerator(generatorFunc: () => IterableIterator<EventIterable>): void;

	/**
	 * Run a given generator function and call `onCompletion` when the function returns
	 * @param generatorFunc
	 * @param onCompletion
	 */
	runGenerator(generatorFunc: () => IterableIterator<EventIterable>, onCompletion?: (result?: any) => void): void;

	/**
	 * Cleanup any listeners and running generators
	 */
	dispose(): void;
}
