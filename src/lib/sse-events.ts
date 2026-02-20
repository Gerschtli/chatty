import z from 'zod';

// do not use these names: "message", "error", "ping", "open"
export const events = {
	messageSent: z.object({
		id: z.string(),
		chatId: z.int(),
		userId: z.string(),
		user: z.object({
			username: z.string()
		}),
		content: z.string(),
		createdAt: z.date()
	}),
	customError: z.literal('error')
};

export type Events = {
	[K in keyof typeof events]: z.infer<(typeof events)[K]>;
};

export type Message = Events['messageSent'];
