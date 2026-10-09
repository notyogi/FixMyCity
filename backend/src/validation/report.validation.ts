import { z } from 'zod';
import { IssueType, Severity, ReportStatus } from '@prisma/client';

export const createReportSchema = z.object({
  image_url: z.string().url('image_url must be a valid URL'),
  lat: z
    .number()
    .min(-90, 'lat must be between -90 and 90')
    .max(90, 'lat must be between -90 and 90'),
  lng: z
    .number()
    .min(-180, 'lng must be between -180 and 180')
    .max(180, 'lng must be between -180 and 180'),
  issue_type: z.nativeEnum(IssueType, {
    message: `issue_type must be one of: ${Object.values(IssueType).join(', ')}`,
  }),
  severity: z.nativeEnum(Severity, {
    message: `severity must be one of: ${Object.values(Severity).join(', ')}`,
  }),
});

export const updateStatusSchema = z.object({
  status: z.nativeEnum(ReportStatus, {
    message: `status must be one of: ${Object.values(ReportStatus).join(', ')}`,
  }),
});

export const listReportsQuerySchema = z.object({
  status: z.nativeEnum(ReportStatus).optional(),
  issue_type: z.nativeEnum(IssueType).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListReportsQuery = z.infer<typeof listReportsQuerySchema>;
