import { requireLogin } from '$lib/server/auth';
import { getLastEventId } from '$lib/server/events';

export async function load() {
	const user = requireLogin();

	const lastEventId = await getLastEventId(user.id);

	return { lastEventId };
}
