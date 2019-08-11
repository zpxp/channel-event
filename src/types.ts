export interface EventData<Data = any, Event extends string | number | symbol = string> {
	type: Event;
	payload: Data;
}
