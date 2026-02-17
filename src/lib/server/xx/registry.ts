type Client = {
	controller: ReadableStreamDefaultController;
};

const connections = new Map<string, Set<Client>>();

export function addClient(userId: string, client: Client) {
	if (!connections.has(userId)) {
		connections.set(userId, new Set());
	}
	connections.get(userId)!.add(client);
}

export function removeClient(userId: string, client: Client) {
	connections.get(userId)?.delete(client);
}

export function getUserClients(userId: string) {
	return connections.get(userId);
}
