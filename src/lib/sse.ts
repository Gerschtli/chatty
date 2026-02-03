import * as devalue from 'devalue';
import { events, type Events } from './sse-events';

export class SseClient {
	#eventSource: EventSource;
	#errorHandler: (err: unknown) => void;
	#handlers: Partial<{ [K in keyof Events]: ((data: Events[K]) => void)[] }> = {};

	constructor(url: string, errorHandler: (err: unknown) => void) {
		this.#eventSource = new EventSource(url);
		this.#errorHandler = (err) => {
			errorHandler(err);
			this.#eventSource.close();
		};

		this.#eventSource.onerror = this.#errorHandler;
	}

	get connected() {
		return this.#eventSource.readyState === EventSource.OPEN;
	}

	addHandler<T extends keyof Events>(eventName: T, handler: (data: Events[T]) => void) {
		if (this.#handlers[eventName]) {
			this.#handlers[eventName].push(handler);
			return;
		}

		this.#handlers[eventName] = [];
		this.#handlers[eventName].push(handler);

		this.#eventSource.addEventListener(eventName, (event: MessageEvent<string>) => {
			try {
				const devalued = devalue.parse(event.data);
				const payload = events[eventName].parse(devalued) as Events[typeof eventName];

				for (const handler of this.#handlers[eventName] || []) {
					handler(payload);
				}
			} catch (err) {
				this.#errorHandler(err);
			}
		});
	}

	close() {
		this.#eventSource.close();
	}
}
