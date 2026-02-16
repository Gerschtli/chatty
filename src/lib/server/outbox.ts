import * as table from '$lib/server/db/schema';
import { asc, inArray } from 'drizzle-orm';
import { db } from './db';
import { getSubscribers } from './registry';

export async function startOutboxWorker({
	batchSize,
	idleTimeoutMs
}: {
	batchSize: number;
	idleTimeoutMs: number;
}) {
	console.log('starting outbox handler');

	while (true) {
		try {
			outboxHandler(batchSize);
		} catch (e) {
			console.error('error occurred in outbox handler', e);
		}

		await sleep(idleTimeoutMs);
	}
}

async function outboxHandler(batchSize: number) {
	while (true) {
		const outboxResults = await db.query.outbox.findMany({
			orderBy: asc(table.outbox.id),
			limit: batchSize,
			with: { event: true }
		});

		if (outboxResults.length === 0) break;

		for (const { event } of outboxResults) {
			for (const subscriber of getSubscribers(event.userId)) {
				subscriber.push({
					id: event.id,
					type: event.type,
					data: event.data
				});
			}
		}

		await db.delete(table.outbox).where(
			inArray(
				table.outbox.id,
				outboxResults.map((r) => r.id)
			)
		);
	}
}

async function sleep(ms: number) {
	return new Promise((res) => setTimeout(res, ms));
}
