import z from 'zod';

export const events = {
	message: z.object({
		id: z.string(),
		userId: z.string(),
		user: z.object({
			username: z.string()
		}),
		content: z.string(),
		createdAt: z.date()
	})
};

export type Events = {
	[K in keyof typeof events]: z.infer<(typeof events)[K]>;
};
