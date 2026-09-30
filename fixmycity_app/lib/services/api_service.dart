import '../models/report_model.dart';

/// Service stub for calling the FixMyCity Express backend API.
class ApiService {
  final String? baseUrl;

  ApiService({this.baseUrl});

  /// Fetch all public infrastructure damage reports.
  Future<List<ReportModel>> fetchReports({int page = 1, int limit = 20}) async {
    // Stub implementation: Will call GET $baseUrl/reports
    throw UnimplementedError('fetchReports() has not been implemented yet.');
  }

  /// Fetch details of a single report by ID.
  Future<ReportModel> fetchReportById(String id) async {
    // Stub implementation: Will call GET $baseUrl/reports/$id
    throw UnimplementedError('fetchReportById() has not been implemented yet.');
  }

  /// Create and submit a new damage report to the backend.
  Future<ReportModel> createReport(ReportModel report) async {
    // Stub implementation: Will call POST $baseUrl/reports
    throw UnimplementedError('createReport() has not been implemented yet.');
  }

  /// Fetch reports submitted by a specific user.
  Future<List<ReportModel>> fetchUserReports(String userId) async {
    // Stub implementation: Will call GET $baseUrl/users/$userId/reports
    throw UnimplementedError('fetchUserReports() has not been implemented yet.');
  }

  /// Update the status of a report (e.g. pending -> in_progress -> resolved).
  Future<ReportModel> updateReportStatus(String reportId, String status) async {
    // Stub implementation: Will call PATCH $baseUrl/reports/$reportId/status
    throw UnimplementedError('updateReportStatus() has not been implemented yet.');
  }
}
