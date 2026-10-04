import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import '../models/report_model.dart';

/// Service for calling the FixMyCity Express backend API.
class ApiService {
  final String? baseUrl;

  ApiService({this.baseUrl});

  /// Check health status of the Express backend API.
  /// Calls GET $BACKEND_API_URL/api/v1/health and expects status 200 with { "status": "ok" }.
  Future<bool> checkBackendHealth() async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    if (rawUrl.isEmpty) {
      debugPrint('ApiService: BACKEND_API_URL is not configured in .env');
      return false;
    }

    try {
      // Normalize base URL (trim and strip trailing slash or duplicate /api if present)
      var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
      if (cleanBase.endsWith('/api')) {
        cleanBase = cleanBase.substring(0, cleanBase.length - 4);
      }

      final uri = Uri.parse('$cleanBase/api/v1/health');
      debugPrint('ApiService: Checking backend health at $uri');

      final response = await http.get(uri).timeout(
        const Duration(seconds: 10),
      );

      if (response.statusCode == 200) {
        try {
          final Map<String, dynamic> body = jsonDecode(response.body);
          if (body['status'] == 'ok') {
            debugPrint('ApiService: Backend health check successful: status ok');
            return true;
          }
        } catch (_) {
          if (response.body.contains('"status":"ok"') ||
              response.body.contains('"status": "ok"')) {
            return true;
          }
        }
      } else if (response.statusCode == 304) {
        debugPrint('ApiService: Backend returned 304 Not Modified (healthy)');
        return true;
      }

      debugPrint(
        'ApiService: Backend returned status ${response.statusCode}: ${response.body}',
      );
      return false;
    } catch (e, stackTrace) {
      debugPrint('ApiService: Error connecting to backend at $rawUrl: $e\n$stackTrace');
      return false;
    }
  }

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
