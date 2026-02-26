import z from 'zod';

// do not use these names: "message", "error", "ping", "open"
export const events = {
	messageSent: z.object({
		id: z.string(),
		chatId: z.int(),
		userId: z.string(),
		user: z.object({
			username: z.string(),
		}),
		content: z.string(),
		createdAt: z.date(),
	}),
	customError: z.literal('error'),
};

export const clientMessages = {
	replay: z.object({
		lastEventId: z.int().optional(),
	}),
	messageSent: z.object({
		chatId: z.int(),
		content: z.string(),
	}),
};

export type Events = {
	[K in keyof typeof events]: z.infer<(typeof events)[K]>;
};

export type ClientMessages = {
	[K in keyof typeof clientMessages]: z.infer<(typeof clientMessages)[K]>;
};

export type Message = Events['messageSent'];
