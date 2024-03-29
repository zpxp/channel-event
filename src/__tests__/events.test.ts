import { createHub, channelReturnSym } from "../hub";
import { EventIterable, take, put, call, takeLatest, delay, fork, takeEvery, takeLast } from "../generator";
import { Timer } from "./timer.notest";
import { EventData } from "src/types";
import { rejects } from "assert";

describe("events", () => {
	test("Should resolve", () => {
		expect(createHub).toEqual(expect.anything());
	});

	test("Create", () => {
		const hub = createHub();

		expect(hub).toEqual(expect.anything());
	});

	test("Create chann", () => {
		const hub = createHub();

		expect(hub.newChannel()).toEqual(expect.anything());
	});

	test("Channel hub", () => {
		const hub = createHub();
		const chan = hub.newChannel();

		expect(chan.hub).toEqual(hub);
	});

	test("listen", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen("test", mock);

		channel.send("test", 5);

		expect(mock).toBeCalledTimes(1);
		expect(mock).toBeCalledWith({ type: "test", payload: 5 });
	});

	test("listen 2", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen("test", mock);

		hub.global.send("test", 5);
		hub.global.send("test", 5);

		expect(mock).toBeCalledTimes(2);
		expect(mock).toBeCalledWith({ type: "test", payload: 5 });
	});

	test("listen 3", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen(["test", "test2"], mock);

		hub.global.send("test", 5);
		hub.global.send("test");
		hub.global.send("test2", 6);

		expect(mock).toBeCalledTimes(3);
	});

	test("listen returns", () => {
		const hub = createHub();
		const channel1 = hub.newChannel("id1");
		const channel2 = hub.newChannel("id2");
		const channel3 = hub.newChannel();
		const channel4 = hub.newChannel("id4");

		channel1.listen("test", () => 6);
		channel2.listen("test", () => "returns");
		channel3.listen("test", () => 66);
		channel4.listen("test", () => null);

		const result = hub.global.send("test");
		expect(result).toEqual({ id1: 6, id2: "returns", id4: null });

		const result2 = hub.global.send("test2");
		expect(result2).toBeNull();
	});

	test("hub middleware", () => {
		const hub = createHub();
		const channel1 = hub.newChannel("id1");
		const channel2 = hub.newChannel("id2");
		const channel3 = hub.newChannel();
		const channel4 = hub.newChannel("id4");

		channel1.listen("switch", () => 6);
		channel2.listen("switch", () => "returns");
		channel3.listen("switch", () => 66);
		channel4.listen("switch", () => null);

		const mock = jest.fn();
		const mock2 = jest.fn();

		hub.addEventMiddleware((context, next) => {
			mock2(context.type);
			context.type = "switch";
			return next(context);
		});

		hub.addEventMiddleware((context, next) => {
			const data = next(context);
			expect(data).toEqual({ id1: 6, id2: "returns", id4: null, [channelReturnSym]: true });
			mock();
			return null;
		});

		const result = hub.global.send("test");

		expect(mock).toBeCalled();
		expect(mock2).toBeCalled();
		expect(mock2).toBeCalledWith("test");
		expect(result).toBeNull();
	});

	test("generator", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				expect(1).toBe(1);
				resolve();
			});
		});
	});

	test("generator yield promise", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				const res = yield new Promise<number>(resolve => {
					setTimeout(() => {
						resolve(1);
					}, 1);
				});
				expect(res).toBe(1);
				resolve();
			});
		});
	});

	test("generator yield promise 2", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				const res = yield new Promise<number>(resolve => {
					setTimeout(() => {
						resolve(1);
					}, 1);
				}).then(res => {
					expect(res).toBe(1);
					return 6;
				});
				expect(res).toBe(6);
				resolve();
			});
		});
	});

	test("generator take", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				const data = yield take("test");
				expect(data).toEqual({ type: "test", payload: 2 });
				resolve();
			});

			channel.send("test", 2);
		});
	});

	test("generator put", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen("test", mock);

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				for (let index = 0; index < 10; index++) {
					const data = yield take("test");
					expect(data).toEqual({ type: "test", payload: 2 });
				}

				expect(mock).toBeCalledTimes(10);

				resolve();
			});

			channel.runGenerator(function* (): Generator<EventIterable> {
				for (let index = 0; index < 10; index++) {
					yield put("test", 2);
				}
			});
		});
	});

	test("generator call", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen("test", mock);

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				for (let index = 0; index < 10; index++) {
					const data = yield take("test");
					expect(data).toEqual({ type: "test", payload: 2 });
				}

				expect(mock).toBeCalledTimes(10);

				resolve();
			});

			function* testfunc(count: number): Generator<EventIterable> {
				for (let index = 0; index < count; index++) {
					yield put("test", 2);
				}
				return 77;
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				const result = yield call(testfunc, 10);
				expect(result).toEqual(77);
			});
		});
	});

	test("generator delay", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				const timer = new Timer();
				timer.start();

				yield delay(10);

				const time = timer.stop();
				expect(time >= 10 && time < 15).toBe(true);

				resolve();
			});
		});
	});

	test("generator fork", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			function* testFork(delayc: number): Generator<EventIterable> {
				yield delay(delayc);
				yield put("test", 77);
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				yield fork(testFork, 500);
				const g = yield take("test");

				expect(g).toEqual({ type: "test", payload: 77 });
				resolve();
			});
		});
	});

	test("generator fork cancel", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		return new Promise<void>(resolve => {
			function* testFork(): Generator<EventIterable> {
				yield delay(100);
				mock();
			}

			channel.runGenerator(function* () {
				const cancel: () => void = yield fork(testFork);
				cancel();
				yield delay(200);

				expect(mock).toBeCalledTimes(0);
				resolve();
			});
		});
	});

	test("generator call promise", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen("test", mock);

		return new Promise<void>(resolve => {
			function testfunc(count: number) {
				return new Promise<number>(resolve => {
					setTimeout(() => {
						resolve(77);
					}, count);
				});
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				const result = yield call(testfunc, 100);
				expect(result).toEqual(77);
				resolve();
			});
		});
	});

	test("generator call advanced", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();

		channel.listen("test", mock);

		return new Promise<void>(resolve => {
			let completed = false;
			channel.runGenerator(function* (): Generator<EventIterable> {
				for (let index = 0; index < 30; index++) {
					const data = yield take("test");
					expect(data).toEqual({ type: "test", payload: 2 });
				}

				completed = true;
			});

			function testfuncprom(duration: number) {
				return new Promise<number>(resolve => {
					setTimeout(() => {
						resolve(77);
					}, duration);
				});
			}

			function* testfunc(count: number, recurse: number): Generator<EventIterable> {
				for (let index = 0; index < count; index++) {
					yield put("test", 2);
				}
				if (recurse > 1) {
					return yield call(testfunc, count, recurse - 1);
				} else {
					return yield testfuncprom(100);
				}
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				const result = yield call(testfunc, 10, 3);
				expect(result).toEqual(77);
				expect(mock).toBeCalledTimes(30);
				expect(completed).toEqual(true);
				resolve();
			});
		});
	});

	test("generator takeLatest", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();
		const mock2 = jest.fn();
		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				yield takeLatest("test", function* (data: EventData<number>) {
					mock2();
					yield delay(100);
					mock();
				});
			});

			function* testfunc(count: number): Generator<EventIterable> {
				for (let index = 0; index < count; index++) {
					yield put("test", 2);
					yield delay(1);
				}
				return 77;
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				const result = yield call(testfunc, 10);
				expect(result).toEqual(77);
			});

			setTimeout(() => {
				expect(mock).toBeCalledTimes(1);
				expect(mock2).toBeCalledTimes(10);
				resolve();
			}, 300);
		});
	});

	test("generator takeevery", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();
		const mock2 = jest.fn();
		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				yield takeEvery("test", function* (data) {
					mock2();
					yield delay(100);
					mock();
				});
			});

			function* testfunc(count: number): Generator<EventIterable> {
				for (let index = 0; index < count; index++) {
					yield put("test", 2);
					yield delay(1);
				}
				return 77;
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				const result = yield call(testfunc, 10);
				expect(result).toEqual(77);
			});

			setTimeout(() => {
				expect(mock).toBeCalledTimes(10);
				expect(mock2).toBeCalledTimes(10);
				resolve();
			}, 300);
		});
	});

	test("generator takeLast", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		const mock = jest.fn();
		const mock2 = jest.fn();
		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				yield takeLast("test", function* (data) {
					mock2();
					yield delay(100);
					mock();
				});
			});

			function* testfunc(count: number): Generator<EventIterable> {
				for (let index = 0; index < count; index++) {
					yield put("test", 2);
					// yield delay(1);
				}
				return 77;
			}

			channel.runGenerator(function* (): Generator<EventIterable> {
				const result = yield call(testfunc, 10);
				expect(result).toEqual(77);
			});

			setTimeout(() => {
				expect(mock).toBeCalledTimes(1);
				expect(mock2).toBeCalledTimes(1);
				resolve();
			}, 200);
		});
	});

	test("generator config", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			function* test(): Generator<EventIterable> {
				expect(1).toBe(1);
				resolve();
			}

			channel.generator.addGenerator(test).restartOnAsyncError().run();
		});
	});

	test("generator err", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		function* test(): Generator<EventIterable> {
			throw new Error("err");
		}

		const mock = jest.fn();

		channel.generator
			.addGenerator(test)
			.addErrorCallback((err: Error) => {
				mock(err.message);
			})
			.run();

		expect(mock).toBeCalledWith("err");
	});

	test("generator err async", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			function* test(): Generator<EventIterable> {
				yield delay(10);
				throw new Error("err");
			}

			const mock = jest.fn();

			function* resolver(): Generator<EventIterable> {
				yield delay(12);
				expect(mock).toBeCalledWith("err");
				resolve();
			}

			channel.generator
				.addGenerator(test)
				.addGenerator(resolver)
				.addErrorCallback((err: Error) => {
					mock(err.message);
				})
				.run();
		});
	});

	test("generator err2", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		function* test(): Generator<EventIterable> {
			throw new Error("err");
		}

		expect(() => channel.generator.addGenerator(test).run()).toThrowError("err");
	});

	test("generator restart", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			let count = 0;
			const mock = jest.fn();

			function* test(): Generator<EventIterable> {
				mock();
				if (count < 10) {
					yield put("test");
					count++;
					yield delay(2);
					throw new Error("err");
				}
			}

			function* check(): Generator<EventIterable> {
				for (let index = 0; index < 10; index++) {
					yield take("test");
				}
				expect(mock).toBeCalledTimes(10);
				resolve();
			}

			channel.generator.addGenerator(check).addGenerator(test).restartOnAsyncError().run();
		});
	});

	test("generator restart call", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			let count = 0;
			const mock = jest.fn();

			function* test(): Generator<EventIterable> {
				mock();
				if (count < 10) {
					yield put("test");
					count++;

					yield call(
						() =>
							new Promise<void>((resolve, reject) => {
								setTimeout(() => {
									reject("err");
								});
							})
					);
				}
			}

			function* check(): Generator<EventIterable> {
				for (let index = 0; index < 10; index++) {
					yield take("test");
				}
				expect(mock).toBeCalledTimes(10);
				resolve();
			}

			channel.generator.addGenerator(check).addGenerator(test).restartOnAsyncError().run();
		});
	});

	test("generator this args", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.generator
				.addGenerator(function* (this: number, defArg: string): Generator<EventIterable> {
					expect(this).toBe(2);
					expect(defArg).toBe("asd");
					resolve();
				})
				.bindThis(2, "asd")
				.run();
		});
	});

	test("generator yield promise throw", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.runGenerator(function* (): Generator<EventIterable> {
				const fn = jest.fn();
				try {
					const res = yield new Promise<number>((resolve, reject) => {
						throw new Error("prom error");
					});
					expect(false).toBe(true);
				} catch (e) {
					fn(e);
				}
				expect(fn).toHaveBeenCalledTimes(1);
				resolve();
			});
		});
	});

	test("generator yield promise throw with rtns", () => {
		const hub = createHub();
		const channel = hub.newChannel();

		return new Promise<void>(resolve => {
			channel.generator
				.addGenerator(function* (): Generator<EventIterable> {
					const fn = jest.fn();
					try {
						const res = yield new Promise<number>((resolve, reject) => {
							throw new Error("prom error");
						});
						expect(false).toBe(true);
					} catch (e) {
						fn(e);
					}
					expect(fn).toHaveBeenCalledTimes(1);
					return 5;
				})
				.addCompletionCallback(res => {
					expect(res).toBe(5);
					resolve();
				})
				.run();
		});
	});
});
