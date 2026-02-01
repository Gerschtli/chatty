import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { error, redirect } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';

export async function load() {
	const user = requireLogin();

	const messages = await db.query.message.findMany({
		orderBy: (message, { desc }) => [desc(message.createdAt)],
		with: {
			user: true
		}
	});

	return { messages, userId: user.id };
}

export const actions = {
	sendMessage: async ({ request }) => {
		const user = requireLogin();

		const formData = await request.formData();
		const content = formData.get('content') as string;

		if (!content) error(400, 'Message content cannot be empty');

		await db.insert(table.message).values({
			id: randomUUID(),
			userId: user.id,
			content,
			createdAt: new Date()
		});
	}
};
function requireLogin() {
	const { locals } = getRequestEvent();

	if (!locals.user) {
		return redirect(302, '/demo/lucia/login');
	}

	return locals.user;
}
