import { IChannel } from "./IChannel";

/**
 * Data object that represents an event
 */
export interface EventData<Data = any, Event extends string | number | symbol = string> {
	type: Event;
	payload: Data;
}

/**
 * Middleware function called between sends and listens
 */
export type EventMiddleware<Data = any> = (
	context: EventMiddlewareContext<Data>,
	next: (context: EventMiddlewareContext<Data>) => object,
	sender?: IChannel
) => object;

export type EventMiddlewareContext<Data = any> = {
	type: string;
	payload: Data;
};
