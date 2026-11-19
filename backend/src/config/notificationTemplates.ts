import { IssueType, ReportStatus } from '@prisma/client';

export const ISSUE_TYPE_READABLE_LABELS: Record<IssueType, string> = {
  [IssueType.POTHOLE]: 'pothole',
  [IssueType.STREETLIGHT]: 'streetlight',
  [IssueType.GARBAGE]: 'garbage',
  [IssueType.DRAINAGE]: 'drainage',
  [IssueType.TRAFFIC_SIGNAL]: 'traffic signal',
  [IssueType.SIDEWALK]: 'sidewalk',
  [IssueType.OTHER]: 'civic issue',
};

export function getReadableIssueLabel(issueType: IssueType): string {
  return ISSUE_TYPE_READABLE_LABELS[issueType] || 'civic issue';
}

export interface NotificationTemplate {
  title: string;
  body: (readableIssue: string) => string;
}

export const STATUS_NOTIFICATION_TEMPLATES: Partial<Record<ReportStatus, NotificationTemplate>> = {
  [ReportStatus.UNDER_REVIEW]: {
    title: 'Your report is under review',
    body: (issue) => `Authorities have started reviewing your ${issue} report.`,
  },
  [ReportStatus.SCHEDULED]: {
    title: 'Repair scheduled',
    body: (issue) => `A repair has been scheduled for the ${issue} you reported.`,
  },
  [ReportStatus.FIXED]: {
    title: 'Issue fixed',
    body: (issue) => `The ${issue} you reported has been marked as fixed. Thank you for helping your city.`,
  },
  [ReportStatus.REJECTED]: {
    title: 'Report closed',
    body: (issue) => `Your ${issue} report was closed because it couldn't be acted on.`,
  },
};
