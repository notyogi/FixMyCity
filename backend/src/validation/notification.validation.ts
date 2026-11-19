import { z } from 'zod';

export const listNotificationsQuerySchema = z.object({
  unread_only: z
    .union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const notificationIdParamSchema = z.object({
  id: z.string().uuid({ message: 'Invalid notification UUID' }),
});
