export interface EventData<Data = any, Event extends string | number | symbol = string> {
	type: Event;
	payload: Data;
}



export type EventMiddleware = (context: EventMiddlewareContext, next: (context: EventMiddlewareContext) => object) => object;

export type EventMiddlewareContext = {
	type: string;
	payload: any;
};
