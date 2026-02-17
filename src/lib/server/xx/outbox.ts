import * as table from '$lib/server/db/schema';
import { asc, eq } from 'drizzle-orm';
import { db } from '../db';

function sleep(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

export async function startOutboxWorker() {
	while (true) {
		try {
			const outbox = await db.query.outbox.findMany({
				where: eq(table.outbox.published, false),
				orderBy: asc(table.outbox.id),
				limit: 100,
				with: { event: true }
			});

			for (const evt of res.rows) {
				try {
					dispatchEventToUser(evt);

					await db.query(
						`
            UPDATE event_outbox
            SET delivered = true,
                delivered_at = now()
            WHERE id = $1
          `,
						[evt.id]
					);
				} catch (err) {
					console.error('dispatch failed', err);
				}
			}
		} catch (err) {
			console.error('outbox worker error', err);
		}

		await sleep(200);
	}
}
