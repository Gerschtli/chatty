export const config = {
	server: {
		pingSendingIntervalMs: 30_000,
		clientReconnectRetryIntervalsMs: 1_000
	},
	outbox: {
		batchSize: 100,
		idleTimeoutMs: 200
	},
	client: {
		connectionStaleTimeoutMs: 40_000
	}
};
