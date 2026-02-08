import { query } from '$app/server';
import { subscribe } from '$lib/server/sse';

export async function GET({ request, url }) {
	const { stream } = subscribe();

	const lastEventIdHeader= request.headers.get('Last-Event-Id');
	const lastEventIdQuery= url.searchParams.get('lastEventId');
	const lastEventId = lastEventIdHeader ?? lastEventIdQuery

	if ()

	return new Response(stream.pipeThrough(new TextEncoderStream()), {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
}

function determineLastEventID(header: string | null, query: string| null) {
	if (header) return header;
	if (query) return query;

	return null;
}
