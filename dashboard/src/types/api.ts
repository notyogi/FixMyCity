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

export interface ClusterReporter {
  id: string;
  name: string | null;
}

export interface ClusterReport {
  id: string;
  image_url: string;
  notes: string | null;
  lat: number;
  lng: number;
  issue_type: IssueType;
  severity: Severity;
  status: ReportStatus;
  near_sensitive_location: boolean;
  created_at: string;
  reporter: ClusterReporter;
}

export interface ClusterConfirmation {
  id: string;
  created_at: string;
  user: ClusterReporter;
}

export interface ClusterDetail {
  id: string;
  centroid_lat: number;
  centroid_lng: number;
  confirmation_count: number;
  priority_score: number;
  created_at: string;
  updated_at: string;
  issue_type: IssueType;
  max_severity: Severity;
  current_status: ReportStatus;
  days_open: number;
  near_sensitive_location: boolean;
  report_count: number;
  reports: ClusterReport[];
  confirmations: ClusterConfirmation[];
  updated_reports_count?: number;
  reputation_changes?: number;
}

export interface UpdateClusterStatusInput {
  status: ReportStatus;
  spam?: boolean;
}


