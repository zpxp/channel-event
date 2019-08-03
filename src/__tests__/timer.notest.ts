
export class Timer {
	private _start: Date;

	start() {
		this._start = new Date();
	}

	stop() {
		const end = new Date();
		return end.getTime() - this._start.getTime();
	}
}
