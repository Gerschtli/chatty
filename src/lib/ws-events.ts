import z from 'zod';

// do not use these names: "message", "error", "ping", "open"
export const schemaServerMessage = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('messageSent'),
		id: z.int(),
		data: z.object({
			id: z.string(),
			chatId: z.int(),
			userId: z.string(),
			user: z.object({
				username: z.string(),
			}),
			content: z.string(),
			createdAt: z.date(),
		}),
	}),
	z.object({
		type: z.literal('error'),
		id: z.int(),
		message: z.string(),
	}),
]);

export const schemaClientMessage = z.discriminatedUnion('type', [
	z.object({
		type: z.literal('replay'),
		lastEventId: z.int().optional(),
	}),
	z.object({
		type: z.literal('messageSent'),
		chatId: z.int(),
		content: z.string(),
	}),
]);

export type ServerMessage = z.infer<typeof schemaServerMessage>;

export type ClientMessage = z.infer<typeof schemaClientMessage>;

export type Message = Extract<ServerMessage, { type: 'messageSent' }>;
