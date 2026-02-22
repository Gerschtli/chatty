import { config } from '$lib/config';
import * as table from '$lib/server/db/schema';
import { asc, inArray } from 'drizzle-orm';
import { db } from './db';
import { getSubscribers } from './sse/registry';

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
			with: { event: true },
		});

		if (outboxResults.length === 0) break;

		for (const { event } of outboxResults) {
			// start SSE
			for (const subscriber of getSubscribers(event.userId)) {
				subscriber.push({
					id: event.id,
					type: event.type,
					data: event.data,
				});
			}
			// end SSE
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
