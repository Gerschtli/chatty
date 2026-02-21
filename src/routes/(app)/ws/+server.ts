import { redirect, type Peer, type Socket } from '@sveltejs/kit';
import * as devalue from 'devalue';

export const socket: Socket = {
	upgrade({ context, locals }) {
		console.log(`[ws] upgrade request`);

		if (!locals.user) redirect(302, '/login');

		context.user = locals.user;
	},

	open(peer) {
		console.log(`[ws] opened connection with peer ${peer}`, peer.context);

		peer.send(stringify(`Welcome to the server!`, 'system'));

		peer.subscribe(`chat`);

		peer.publish(`chat`, stringify(`${peer} joined!`, 'system'));
	},

	message(peer, message) {
		console.log(`[ws] received message from peer ${peer}`, `:`, parse(message.text()));

		peer.publish(`chat`, stringify(parse(message.text()).message, peer));

		console.log(`current peers:`);
		for (const element of peer.peers) {
			console.log(`- ${element}:`, element.context);
		}
	},

	close(peer) {
		console.log(`[ws] closed connection with peer ${peer}`);

		peer.publish(`chat`, stringify(`${peer} has left the chat!`, 'system'));

		peer.unsubscribe(`chat`);
	},

	error(peer, error) {
		console.log(`[ws] error with peer ${peer}`, error);
	},
};

function stringify(message: string, from: Peer | 'system') {
	return devalue.stringify({ message, from: from === 'system' ? from : from.id });
}

function parse(data: string) {
	return devalue.parse(data);
}
