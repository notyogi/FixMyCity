export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type IssueType =
  | 'POTHOLE'
  | 'STREETLIGHT'
  | 'GARBAGE'
  | 'DRAINAGE'
  | 'TRAFFIC_SIGNAL'
  | 'SIDEWALK'
  | 'OTHER';

export type ReportStatus =
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'SCHEDULED'
  | 'FIXED'
  | 'REJECTED';

export interface Centroid {
  lat: number;
  lng: number;
}

export interface RepresentativeReport {
  id: string;
  image_url: string;
  notes: string | null;
  created_at: string;
}

export interface QueueItem {
  cluster_id: string;
  priority_score: number;
  confirmation_count: number;
  report_count: number;
  max_severity: Severity;
  issue_type: IssueType;
  status: ReportStatus;
  near_sensitive_location: boolean;
  centroid: Centroid;
  days_open: number;
  oldest_report_created_at: string;
  representative_report: RepresentativeReport;
}

export interface PriorityQueueMeta {
  unclustered_active_reports: number;
  scores_refreshed_at: string;
}

export interface PriorityQueueResponse {
  data: QueueItem[];
  page: number;
  limit: number;
  total: number;
  meta: PriorityQueueMeta;
}

export interface HealthResponse {
  status: string;
}

