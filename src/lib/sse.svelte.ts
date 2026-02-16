import * as devalue from 'devalue';
import { events, type Events } from './sse-events';

const CONNECTION_STALE_TIMEOUT_MS = 40_000;

export class SseClient {
	#eventSource: EventSource;
	#errorHandler: (err: unknown) => void;
	#handlers: Partial<{ [K in keyof Events]: ((data: Events[K]) => void)[] }> = {};

	#connectionStatus: 'connecting' | 'connected' | 'stale' | 'closed' = $state('connecting');
	#staleTimeout: NodeJS.Timeout | null = $state(null);

	constructor(url: string, errorHandler: (err: unknown) => void) {
		this.#eventSource = new EventSource(url);
		this.#errorHandler = errorHandler;

		this.#eventSource.onopen = () => {
			this.#connectionStatus = 'connected';
		};

		this.#eventSource.onerror = (event) => {
			this.#connectionStatus =
				this.#eventSource.readyState === EventSource.CLOSED ? 'closed' : 'connecting';

			this.#errorHandler(new Error(`SSE connection error: ${JSON.stringify(event)}`));
		};

		this.addHandler('ping', () => {});

		this.#restartStaleTimeout();
	}

	#restartStaleTimeout() {
		if (this.#staleTimeout) clearTimeout(this.#staleTimeout);

		if (this.#connectionStatus === 'stale') {
			this.#connectionStatus = 'connected';
		}

		this.#staleTimeout = setTimeout(() => {
			if (this.#connectionStatus === 'connected') {
				this.#connectionStatus = 'stale';
			}
		}, CONNECTION_STALE_TIMEOUT_MS);
	}

	get connectionStatus() {
		return this.#connectionStatus;
	}

	addHandler<T extends keyof Events>(eventName: T, handler: (data: Events[T]) => void) {
		if (this.#handlers[eventName]) {
			this.#handlers[eventName].push(handler);
			return;
		}

		this.#handlers[eventName] = [];
		this.#handlers[eventName].push(handler);

		this.#eventSource.addEventListener(eventName, (event: MessageEvent<string>) => {
			this.#restartStaleTimeout();

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
