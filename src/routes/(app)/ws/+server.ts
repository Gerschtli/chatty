import { registerSocketHandler, removeSocketHandler } from '$lib/server/ws/registry';
import { SocketHandler } from '$lib/server/ws/socketHandler';
import { redirect, type Peer, type Socket } from '@sveltejs/kit';

export const socket: Socket = {
	upgrade({ context, locals }) {
		console.log(`[ws] upgrade request`);

		if (!locals.user) redirect(302, '/login');

		const socketHandler = new SocketHandler(locals.user.id);
		registerSocketHandler(socketHandler);

		setContextSocketHandler(context, socketHandler);
	},

	open(peer) {
		const socketHandler = getContextSocketHandler(peer);

		socketHandler.onOpen(peer);
	},

	// TODO: is the processing of the next client message blocked/queued while this method still runs?
	async message(peer, message) {
		const socketHandler = getContextSocketHandler(peer);

		await socketHandler.onClientMessage(peer, message.text());
	},

	close(peer) {
		const socketHandler = getContextSocketHandler(peer);
		console.log(`[ws] closed connection with peer ${peer}`);

		removeSocketHandler(socketHandler);
		socketHandler.close();
	},

	// TODO: are errors caught here if thrown in the other handlers?
	error(peer, error) {
		console.log(`[ws] error with peer ${peer}`, error);
	},
};

function setContextSocketHandler(context: Record<string, unknown>, socketHandler: SocketHandler) {
	context.socketHandler = socketHandler;
}

function getContextSocketHandler(peer: Peer) {
	if (peer.context.socketHandler instanceof SocketHandler) {
		return peer.context.socketHandler;
	}

	throw new Error('SocketHandler not set in Peer context');
}
