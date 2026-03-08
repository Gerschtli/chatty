import { config } from '$lib/config';
import * as table from '$lib/server/db/schema';
import { asc, inArray } from 'drizzle-orm';
import { db } from './db';
import { getSubscribers } from './sse/registry';
import { getSocketHandlers } from './ws/registry';

export async function startOutboxWorker() {
	console.log('starting outbox handler');

	while (true) {
		try {
			outboxHandler();
		} catch (e) {
			console.error('error occurred in outbox handler', e);
		}

		try {
			await sleep(config.outbox.idleTimeoutMs);
		} catch (e) {
			console.error('error occurred during sleep in outbox handler', e);
		}
	}
}

async function outboxHandler() {
	while (true) {
		const outboxResults = await db.query.outbox.findMany({
			orderBy: asc(table.outbox.id),
			limit: config.outbox.batchSize,
			with: {
				event: {
					columns: {
						id: true,
						userId: true,
						type: true,
						data: true,
					},
				},
			},
		});

		if (outboxResults.length === 0) break;

		for (const {
			event: { userId, ...event },
		} of outboxResults) {
			// start SSE
			for (const subscriber of getSubscribers(userId)) {
				subscriber.push(event);
			}
			// end SSE

			// start WS
			for (const socketHandler of getSocketHandlers(userId)) {
				socketHandler.push(event);
			}
			// end WS
		}

		await db.delete(table.outbox).where(
			inArray(
				table.outbox.id,
				outboxResults.map((r) => r.id),
			),
		);
	}
}

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}
