import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/report_model.dart';

/// Thrown when the user's Supabase session is missing or expired.
class NotAuthenticatedException implements Exception {
  final String message;

  const NotAuthenticatedException([
    this.message = 'Your session expired, please log in again.',
  ]);

  @override
  String toString() => message;
}

/// Thrown when report creation fails due to validation, backend rejection, or network issues.
class ReportSubmissionException implements Exception {
  final String message;

  const ReportSubmissionException(this.message);

  @override
  String toString() => message;
}

/// Service for calling the FixMyCity Express backend API.
class ApiService {
  final String? baseUrl;
  final http.Client? client;

  ApiService({this.baseUrl, this.client});

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

      final httpClient = client ?? http.Client();
      final response = await httpClient.get(uri).timeout(
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

  /// Submits a newly created infrastructure damage report to the backend.
  ///
  /// Makes an authenticated POST request to `$BACKEND_API_URL/api/reports`.
  /// Throws [NotAuthenticatedException] if user is not logged in or session expired.
  /// Throws [ReportSubmissionException] on validation failure, server error, or connection issue.
  Future<Map<String, dynamic>> submitReport({
    required String imageUrl,
    required double lat,
    required double lng,
    required String issueType,
    required String severity,
    String? notes,
    String? authToken,
  }) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    if (rawUrl.isEmpty) {
      throw const ReportSubmissionException(
        'Backend URL is not configured. Check BACKEND_API_URL in .env.',
      );
    }

    // Retrieve Supabase JWT access token
    String? token = authToken;
    if (token == null) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException(
        'Your session expired, please log in again.',
      );
    }

    // Build endpoint URL
    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final url = cleanBase.endsWith('/api') ? '$cleanBase/reports' : '$cleanBase/api/reports';

    try {
      final httpClient = client ?? http.Client();
      final response = await httpClient
          .post(
            Uri.parse(url),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': 'application/json',
            },
            body: jsonEncode({
              'image_url': imageUrl,
              'lat': lat,
              'lng': lng,
              'issue_type': issueType,
              'severity': severity,
              if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
            }),
          )
          .timeout(
            const Duration(seconds: 20),
          );

      if (response.statusCode == 201) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          return decoded;
        }
        return <String, dynamic>{'data': decoded};
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException(
          'Your session expired, please log in again.',
        );
      }

      if (response.statusCode == 400) {
        String validationSummary = 'Validation failed';
        try {
          final dynamic body = jsonDecode(response.body);
          if (body is Map<String, dynamic>) {
            if (body['details'] is List) {
              final issues = (body['details'] as List)
                  .map((issue) {
                    if (issue is Map) {
                      return issue['message'] ?? issue['error'] ?? issue.toString();
                    }
                    return issue.toString();
                  })
                  .where((msg) => msg.toString().trim().isNotEmpty)
                  .join(', ');
              if (issues.isNotEmpty) {
                validationSummary = issues;
              }
            } else if (body['error'] != null) {
              validationSummary = body['error'].toString();
            } else if (body['message'] != null) {
              validationSummary = body['message'].toString();
            }
          }
        } catch (_) {
          if (response.body.isNotEmpty) {
            validationSummary = response.body;
          }
        }
        throw ReportSubmissionException(validationSummary);
      }

      // Any other non-2xx status
      String errorMessage = 'Failed to submit report, please try again';
      try {
        final dynamic body = jsonDecode(response.body);
        if (body is Map<String, dynamic>) {
          if (body['error'] != null) {
            errorMessage = body['error'].toString();
          } else if (body['message'] != null) {
            errorMessage = body['message'].toString();
          }
        }
      } catch (_) {}
      throw ReportSubmissionException(errorMessage);
    } on NotAuthenticatedException {
      rethrow;
    } on ReportSubmissionException {
      rethrow;
    } on TimeoutException {
      throw const ReportSubmissionException(
        'Check your internet connection and try again',
      );
    } on SocketException {
      throw const ReportSubmissionException(
        'Check your internet connection and try again',
      );
    } on http.ClientException {
      throw const ReportSubmissionException(
        'Check your internet connection and try again',
      );
    } catch (e) {
      final errStr = e.toString().toLowerCase();
      if (errStr.contains('timeout') ||
          errStr.contains('socket') ||
          errStr.contains('connection') ||
          errStr.contains('network') ||
          errStr.contains('clientexception')) {
        throw const ReportSubmissionException(
          'Check your internet connection and try again',
        );
      }
      throw ReportSubmissionException('Failed to submit report: $e');
    }
  }

  /// Fetch public infrastructure damage reports from the backend.
  Future<List<ReportModel>> fetchReports({
    String? status,
    String? issueType,
    int page = 1,
    int limit = 100,
    String? authToken,
  }) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    if (rawUrl.isEmpty) {
      throw const ReportSubmissionException(
        'Backend URL is not configured. Check BACKEND_API_URL in .env.',
      );
    }

    String? token = authToken;
    if (token == null) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final endpoint = cleanBase.endsWith('/api') ? '$cleanBase/reports' : '$cleanBase/api/v1/reports';

    final queryParams = <String, String>{
      'page': page.toString(),
      'limit': limit.toString(),
      if (status != null && status.isNotEmpty) 'status': status,
      if (issueType != null && issueType.isNotEmpty) 'issue_type': issueType,
    };

    final uri = Uri.parse(endpoint).replace(queryParameters: queryParams);

    try {
      final httpClient = client ?? http.Client();
      final headers = <String, String>{
        'Content-Type': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };

      final response = await httpClient.get(uri, headers: headers).timeout(
        const Duration(seconds: 15),
      );

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        final List<dynamic> rawList = decoded is Map<String, dynamic> && decoded['data'] is List
            ? decoded['data'] as List<dynamic>
            : (decoded is List ? decoded : []);
        return rawList
            .whereType<Map<String, dynamic>>()
            .map((item) => ReportModel.fromMap(item))
            .toList();
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException(
          'Your session expired, please log in again.',
        );
      }

      throw ReportSubmissionException('Failed to fetch reports (HTTP ${response.statusCode})');
    } catch (e) {
      debugPrint('ApiService.fetchReports error: $e');
      rethrow;
    }
  }

  /// Fetch details of a single report by ID.
  Future<ReportModel> fetchReportById(String id, {String? authToken}) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    if (rawUrl.isEmpty) {
      throw const ReportSubmissionException(
        'Backend URL is not configured. Check BACKEND_API_URL in .env.',
      );
    }

    String? token = authToken;
    if (token == null) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final url = cleanBase.endsWith('/api') ? '$cleanBase/reports/$id' : '$cleanBase/api/v1/reports/$id';

    try {
      final httpClient = client ?? http.Client();
      final headers = <String, String>{
        'Content-Type': 'application/json',
        if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
      };

      final response = await httpClient.get(Uri.parse(url), headers: headers).timeout(
        const Duration(seconds: 15),
      );

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          return ReportModel.fromMap(decoded);
        }
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException(
          'Your session expired, please log in again.',
        );
      }

      throw ReportSubmissionException('Failed to fetch report details (HTTP ${response.statusCode})');
    } catch (e) {
      debugPrint('ApiService.fetchReportById error: $e');
      rethrow;
    }
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
