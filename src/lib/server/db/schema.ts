import { relations } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const user = sqliteTable('user', {
	id: text('id').primaryKey(),
	age: integer('age'),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash').notNull()
});

export const session = sqliteTable('session', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

export const message = sqliteTable('message', {
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	content: text('content').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const event = sqliteTable('event', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id),
	type: text('type').notNull(),
	data: text('data').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const outbox = sqliteTable('outbox', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	eventId: integer('event_id')
		.notNull()
		.references(() => event.id),
	published: integer('published', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export type Session = typeof session.$inferSelect;

export type User = typeof user.$inferSelect;

export type Message = typeof message.$inferSelect;

export type Event = typeof event.$inferSelect;

export type Outbox = typeof outbox.$inferSelect;

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	messages: many(message),
	events: many(event)
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id]
	})
}));

export const messageRelations = relations(message, ({ one }) => ({
	user: one(user, {
		fields: [message.userId],
		references: [user.id]
	})
}));

export const eventRelations = relations(event, ({ one, many }) => ({
	user: one(user, {
		fields: [event.userId],
		references: [user.id]
	}),
	outboxEntries: many(outbox)
}));

export const outboxRelations = relations(outbox, ({ one }) => ({
	event: one(event, {
		fields: [outbox.eventId],
		references: [event.id]
	})
}));
