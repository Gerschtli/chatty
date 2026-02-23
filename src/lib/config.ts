export const config = {
	server: {
		pingSendingIntervalMs: 30_000,
		clientReconnectRetryIntervalsMs: 1_000,
	},
	outbox: {
		batchSize: 100,
		idleTimeoutMs: 200,
	},
	client: {
		connectionStaleTimeoutMs: 40_000,
		// needs to be high enough to store all events that could be emitted while the SSR is loading
		maxStoredEventsPerType: 200,
	},
	ws: {
		delimiter: ',',
	},
};
