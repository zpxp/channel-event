import { EventIterable } from "./generator";

export class GeneratorUtils {
	static isEventIterable(val: any): val is EventIterable<any> {
		return val && "function" in val && typeof val.function === "string" && "value" in val;
	}

	static isIterableIterator(val: any): val is IterableIterator<EventIterable<any>> {
		return (
			val &&
			typeof val === "object" &&
			"next" in val &&
			typeof val.next === "function" &&
			"throw" in val &&
			typeof val.throw === "function"
		);
	}
}
