import { createServerFn } from '@tanstack/react-start';
import { and, db, desc, eq } from 'void/db';
import { apiTokens } from '@schema';
import { z } from 'zod';
import { newId } from './ids';
import { requireUser } from './server';
import { API_TOKEN_PREFIX, hashApiToken } from './session';

const MAX_TOKENS = 20;

export type ApiTokenView = { id: string; name: string; prefix: string; lastUsedAt: string | null; createdAt: string };

function randomToken() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  // 32 characters from 62: about 190 bits. The modulo bias (256 % 62) is irrelevant at this length.
  return API_TOKEN_PREFIX + [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export const listApiTokensFn = createServerFn({ method: 'GET' }).handler(async (): Promise<ApiTokenView[]> => {
  const me = await requireUser();
  return db
    .select({
      id: apiTokens.id,
      name: apiTokens.name,
      prefix: apiTokens.prefix,
      lastUsedAt: apiTokens.lastUsedAt,
      createdAt: apiTokens.createdAt,
    })
    .from(apiTokens)
    .where(eq(apiTokens.userId, me.id))
    .orderBy(desc(apiTokens.createdAt));
});

/** Returns the token itself exactly once; only its hash is kept. */
export const createApiTokenFn = createServerFn({ method: 'POST' })
  .validator(z.object({ name: z.string().trim().min(1, 'Name the token').max(60) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    const existing = await db.select({ id: apiTokens.id }).from(apiTokens).where(eq(apiTokens.userId, me.id));
    if (existing.length >= MAX_TOKENS) throw new Error(`You can have up to ${MAX_TOKENS} tokens. Revoke one first.`);
    const token = randomToken();
    const id = newId();
    await db.insert(apiTokens).values({
      id,
      userId: me.id,
      name: data.name,
      tokenHash: await hashApiToken(token),
      prefix: token.slice(0, API_TOKEN_PREFIX.length + 4),
    });
    return { id, token };
  });

export const revokeApiTokenFn = createServerFn({ method: 'POST' })
  .validator(z.object({ id: z.string().max(64) }))
  .handler(async ({ data }) => {
    const me = await requireUser();
    await db.delete(apiTokens).where(and(eq(apiTokens.id, data.id), eq(apiTokens.userId, me.id)));
    return { ok: true as const };
  });
