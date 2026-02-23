import { registerSocketHandler, removeSocketHandler } from '$lib/server/ws/registry';
import { SocketHandler } from '$lib/server/ws/socketHandler';
import { redirect, type Peer, type Socket } from '@sveltejs/kit';
import * as devalue from 'devalue';

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
		console.log(`[ws] opened connection with peer ${peer}`, peer.context);

		socketHandler.onOpen();

		// peer.send(stringify(`Welcome to the server!`, 'system'));

		// peer.subscribe(`chat`);

		// peer.publish(`chat`, stringify(`${peer} joined!`, 'system'));
	},

	// TODO: is the processing of the next client message blocked/queued while this method still runs?
	async message(peer, message) {
		const socketHandler = getContextSocketHandler(peer);
		console.log(`[ws] received message from peer ${peer}`, `:`, parse(message.text()));

		await socketHandler.onClientMessage(peer, message.text());
		// peer.publish(`chat`, stringify(parse(message.text()).message, peer));

		// console.log(`current peers:`);
		// for (const element of peer.peers) {
		// 	console.log(`- ${element}:`, element.context);
		// }
	},

	close(peer) {
		const socketHandler = getContextSocketHandler(peer);
		console.log(`[ws] closed connection with peer ${peer}`);

		removeSocketHandler(socketHandler);
		socketHandler.close();

		peer.publish(`chat`, stringify(`${peer} has left the chat!`, 'system'));

		peer.unsubscribe(`chat`);
	},

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

function stringify(message: string, from: Peer | 'system') {
	return devalue.stringify({ message, from: from === 'system' ? from : from.id });
}

function parse(data: string) {
	return devalue.parse(data);
}
