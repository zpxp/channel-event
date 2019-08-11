export interface EventData<Data = any, Event extends string | number | symbol = string> {
	type: Event;
	payload: Data;
}



export type EventMiddleware<Data = any> = (context: EventMiddlewareContext<Data>, next: (context: EventMiddlewareContext<Data>) => object) => object;

export type EventMiddlewareContext<Data = any> = {
	type: string;
	payload: Data;
};
