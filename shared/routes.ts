import { z } from 'zod';
import { insertUserSchema, users, gameStates } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
  unauthorized: z.object({
    message: z.string(),
  }),
};

export const api = {
  auth: {
    register: {
      method: 'POST' as const,
      path: '/api/register' as const,
      input: insertUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    login: {
      method: 'POST' as const,
      path: '/api/login' as const,
      input: insertUserSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    me: {
      method: 'GET' as const,
      path: '/api/me' as const,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        401: errorSchemas.unauthorized,
      },
    },
    logout: {
      method: 'POST' as const,
      path: '/api/logout' as const,
      responses: {
        200: z.object({ message: z.string() }),
      },
    }
  },
  game: {
    state: {
      method: 'GET' as const,
      path: '/api/game/state' as const,
      responses: {
        200: z.object({ balance: z.number(), gameStates: z.array(z.custom<typeof gameStates.$inferSelect>()) }),
        401: errorSchemas.unauthorized,
      },
    },
    spin: {
      method: 'POST' as const,
      path: '/api/game/spin' as const,
      input: z.object({ slotId: z.string(), betAmount: z.number() }),
      responses: {
        200: z.object({
          grid: z.array(z.array(z.string())),
          winLines: z.array(z.number()),
          winAmount: z.number(),
          newBalance: z.number(),
          freeSpinsAwarded: z.number(),
          totalFreeSpins: z.number(),
          isJackpot: z.boolean(),
        }),
        400: errorSchemas.validation,
        401: errorSchemas.unauthorized,
      },
    },
    leaderboard: {
      method: 'GET' as const,
      path: '/api/game/leaderboard' as const,
      responses: {
        200: z.array(z.object({ username: z.string(), balance: z.number() })),
      },
    },
  },
  ai: {
    predict: {
      method: 'GET' as const,
      path: '/api/ai/predict' as const,
      responses: {
        200: z.object({ advice: z.string() }),
      },
    }
  }
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
