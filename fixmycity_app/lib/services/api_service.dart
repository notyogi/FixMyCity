import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/report_model.dart';
import '../models/notification_model.dart';

/// Response payload containing paginated in-app notifications.
class NotificationListResponse {
  final List<NotificationModel> data;
  final int page;
  final int limit;
  final int total;
  final int unreadCount;

  const NotificationListResponse({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
    required this.unreadCount,
  });

  factory NotificationListResponse.fromJson(Map<String, dynamic> json) {
    final rawList = json['data'] as List<dynamic>? ?? [];
    final items = rawList
        .whereType<Map<String, dynamic>>()
        .map((m) => NotificationModel.fromJson(m))
        .toList();

    return NotificationListResponse(
      data: items,
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 20,
      total: json['total'] as int? ?? items.length,
      unreadCount: json['unread_count'] as int? ?? 0,
    );
  }
}

/// Counts summary for citizen's lifetime submissions.
class MyReportsCounts {
  final int total;
  final int active;
  final int fixed;
  final int rejected;

  const MyReportsCounts({
    this.total = 0,
    this.active = 0,
    this.fixed = 0,
    this.rejected = 0,
  });

  factory MyReportsCounts.fromJson(Map<String, dynamic> json) {
    return MyReportsCounts(
      total: json['total'] as int? ?? 0,
      active: json['active'] as int? ?? 0,
      fixed: json['fixed'] as int? ?? 0,
      rejected: json['rejected'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toJson() => {
    'total': total,
    'active': active,
    'fixed': fixed,
    'rejected': rejected,
  };
}

/// Response payload containing paginated personal reports and lifetime summary counts.
class MyReportsResponse {
  final List<ReportModel> data;
  final int page;
  final int limit;
  final int total;
  final MyReportsCounts counts;

  const MyReportsResponse({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
    required this.counts,
  });

  factory MyReportsResponse.fromJson(Map<String, dynamic> json) {
    final rawList = json['data'] as List<dynamic>? ?? [];
    final items = rawList
        .whereType<Map<String, dynamic>>()
        .map((m) => ReportModel.fromMap(m))
        .toList();

    return MyReportsResponse(
      data: items,
      page: json['page'] as int? ?? 1,
      limit: json['limit'] as int? ?? 20,
      total: json['total'] as int? ?? items.length,
      counts: json['counts'] is Map<String, dynamic>
          ? MyReportsCounts.fromJson(json['counts'] as Map<String, dynamic>)
          : const MyReportsCounts(),
    );
  }

  Map<String, dynamic> toJson() => {
    'data': data.map((d) => d.toMap()).toList(),
    'page': page,
    'limit': limit,
    'total': total,
    'counts': counts.toJson(),
  };
}

/// Citizen reputation summary returned by GET /users/me/reputation.
class UserReputationSummary {
  final int score;
  final String level;

  const UserReputationSummary({
    this.score = 0,
    this.level = 'NEW',
  });

  factory UserReputationSummary.fromJson(Map<String, dynamic> json) {
    return UserReputationSummary(
      score: json['score'] as int? ?? 0,
      level: json['level'] as String? ?? 'NEW',
    );
  }

  Map<String, dynamic> toJson() => {
    'score': score,
    'level': level,
  };
}

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

/// Thrown when the user has exceeded their hourly reporting quota (HTTP 429).
class RateLimitedException implements Exception {
  final String message;
  final int retryAfterSeconds;

  const RateLimitedException({
    required this.message,
    required this.retryAfterSeconds,
  });

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
    bool nearSensitiveLocation = false,
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
              'near_sensitive_location': nearSensitiveLocation,
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

      if (response.statusCode == 429) {
        // Read Retry-After header first, falling back to JSON body retry_after_seconds
        int retryAfter = 3600;
        final retryAfterHeader = response.headers['retry-after'];
        if (retryAfterHeader != null) {
          final parsed = int.tryParse(retryAfterHeader.trim());
          if (parsed != null && parsed > 0) {
            retryAfter = parsed;
          }
        }

        String message = 'Report limit reached. Please try again later.';
        try {
          final dynamic body = jsonDecode(response.body);
          if (body is Map<String, dynamic>) {
            if (retryAfterHeader == null && body['retry_after_seconds'] is int) {
              retryAfter = body['retry_after_seconds'] as int;
            }
            if (body['error'] != null) {
              message = body['error'].toString();
            } else if (body['message'] != null) {
              message = body['message'].toString();
            }
          }
        } catch (_) {}

        throw RateLimitedException(
          message: message,
          retryAfterSeconds: retryAfter,
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
    } on RateLimitedException {
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
    String? userId,
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
      if (userId != null && userId.isNotEmpty) 'user_id': userId,
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

  /// Fetch in-app notifications for the authenticated citizen.
  Future<NotificationListResponse> fetchNotifications({
    bool unreadOnly = false,
    int page = 1,
    int limit = 20,
    String? authToken,
  }) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    var token = authToken;
    if (token == null || token.isEmpty) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException();
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final baseApi = cleanBase.endsWith('/api') ? cleanBase : '$cleanBase/api/v1';
    final uri = Uri.parse('$baseApi/notifications?unread_only=$unreadOnly&page=$page&limit=$limit');

    try {
      final httpClient = client ?? http.Client();
      final response = await httpClient.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          return NotificationListResponse.fromJson(decoded);
        }
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException();
      }

      throw ReportSubmissionException(
        'Failed to fetch notifications (HTTP ${response.statusCode})',
      );
    } on SocketException catch (e) {
      throw ReportSubmissionException('No network connection: ${e.message}');
    } on TimeoutException catch (e) {
      throw ReportSubmissionException('Request timed out: ${e.message}');
    } catch (e) {
      debugPrint('ApiService.fetchNotifications error: $e');
      rethrow;
    }
  }

  /// Fetch unread notifications count for badge display and polling.
  Future<int> fetchUnreadCount({String? authToken}) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    var token = authToken;
    if (token == null || token.isEmpty) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException();
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final baseApi = cleanBase.endsWith('/api') ? cleanBase : '$cleanBase/api/v1';
    final uri = Uri.parse('$baseApi/notifications/unread-count');

    try {
      final httpClient = client ?? http.Client();
      final response = await httpClient.get(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic> && decoded.containsKey('unread_count')) {
          return decoded['unread_count'] as int? ?? 0;
        }
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException();
      }

      throw ReportSubmissionException(
        'Failed to fetch unread count (HTTP ${response.statusCode})',
      );
    } on SocketException catch (e) {
      throw ReportSubmissionException('No network connection: ${e.message}');
    } on TimeoutException catch (e) {
      throw ReportSubmissionException('Request timed out: ${e.message}');
    } catch (e) {
      debugPrint('ApiService.fetchUnreadCount error: $e');
      rethrow;
    }
  }

  /// Mark a specific notification as read.
  Future<NotificationModel?> markNotificationRead(String id, {String? authToken}) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    var token = authToken;
    if (token == null || token.isEmpty) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException();
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final baseApi = cleanBase.endsWith('/api') ? cleanBase : '$cleanBase/api/v1';
    final uri = Uri.parse('$baseApi/notifications/$id/read');

    try {
      final httpClient = client ?? http.Client();
      final response = await httpClient.patch(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic> && decoded['notification'] is Map<String, dynamic>) {
          return NotificationModel.fromJson(decoded['notification']);
        }
        return null;
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException();
      }

      throw ReportSubmissionException(
        'Failed to mark notification as read (HTTP ${response.statusCode})',
      );
    } on SocketException catch (e) {
      throw ReportSubmissionException('No network connection: ${e.message}');
    } on TimeoutException catch (e) {
      throw ReportSubmissionException('Request timed out: ${e.message}');
    } catch (e) {
      debugPrint('ApiService.markNotificationRead error: $e');
      rethrow;
    }
  }

  /// Mark all unread notifications for the user as read.
  Future<int> markAllNotificationsRead({String? authToken}) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    var token = authToken;
    if (token == null || token.isEmpty) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException();
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final baseApi = cleanBase.endsWith('/api') ? cleanBase : '$cleanBase/api/v1';
    final uri = Uri.parse('$baseApi/notifications/read-all');

    try {
      final httpClient = client ?? http.Client();
      final response = await httpClient.post(
        uri,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        },
      ).timeout(const Duration(seconds: 10));

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic> && decoded.containsKey('updated_count')) {
          return decoded['updated_count'] as int? ?? 0;
        }
        return 0;
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException();
      }

      throw ReportSubmissionException(
        'Failed to mark all notifications as read (HTTP ${response.statusCode})',
      );
    } on SocketException catch (e) {
      throw ReportSubmissionException('No network connection: ${e.message}');
    } on TimeoutException catch (e) {
      throw ReportSubmissionException('Request timed out: ${e.message}');
    } catch (e) {
      debugPrint('ApiService.markAllNotificationsRead error: $e');
      rethrow;
    }
  }

  /// Fetch the authenticated user's own damage reports with lifetime counts.
  /// Calls GET /api/v1/reports/mine (protected by requireAuth).
  ///
  /// Includes an automatic fallback to GET /reports?user_id= if the backend
  /// environment (e.g. Render free tier) has not yet deployed /reports/mine.
  Future<MyReportsResponse> fetchMyReports({
    String? status,
    bool? active,
    int page = 1,
    int limit = 20,
    String? authToken,
  }) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    if (rawUrl.isEmpty) {
      throw const ReportSubmissionException(
        'Backend URL is not configured. Check BACKEND_API_URL in .env.',
      );
    }

    String? token = authToken;
    if (token == null || token.isEmpty) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException();
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final baseApi = cleanBase.endsWith('/api') ? cleanBase : '$cleanBase/api/v1';
    final endpoint = '$baseApi/reports/mine';

    final queryParams = <String, String>{
      'page': page.toString(),
      'limit': limit.toString(),
      if (status != null && status.isNotEmpty) 'status': status,
      if (active != null) 'active': active.toString(),
    };

    final uri = Uri.parse(endpoint).replace(queryParameters: queryParams);

    try {
      final httpClient = client ?? http.Client();
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

      final response = await httpClient.get(uri, headers: headers).timeout(
        const Duration(seconds: 15),
      );

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          return MyReportsResponse.fromJson(decoded);
        }
        return MyReportsResponse(
          data: const [],
          page: page,
          limit: limit,
          total: 0,
          counts: const MyReportsCounts(),
        );
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException(
          'Your session expired, please log in again.',
        );
      }

      if (response.statusCode == 404) {
        // Fallback for deployments where /reports/mine is not yet live (e.g. Render pending git deployment):
        // Query GET /reports?user_id=... supported by legacy/pre-existing backend instances
        String? currentUid;
        try {
          currentUid = Supabase.instance.client.auth.currentSession?.user.id;
        } catch (_) {}

        final fallbackList = await fetchReports(
          userId: currentUid,
          authToken: token,
          limit: 100,
          page: 1,
        );

        final totalCount = fallbackList.length;
        final activeCount = fallbackList.where((r) {
          final s = r.status.toUpperCase();
          return s == 'SUBMITTED' || s == 'UNDER_REVIEW' || s == 'SCHEDULED';
        }).length;
        final fixedCount = fallbackList
            .where((r) =>
                r.status.toUpperCase() == 'FIXED' ||
                r.status.toUpperCase() == 'RESOLVED')
            .length;
        final rejectedCount = fallbackList
            .where((r) => r.status.toUpperCase() == 'REJECTED')
            .length;

        List<ReportModel> filteredList = fallbackList;
        if (active == true) {
          filteredList = fallbackList.where((r) {
            final s = r.status.toUpperCase();
            return s == 'SUBMITTED' ||
                s == 'UNDER_REVIEW' ||
                s == 'SCHEDULED';
          }).toList();
        } else if (status != null && status.isNotEmpty) {
          filteredList = fallbackList
              .where((r) => r.status.toUpperCase() == status.toUpperCase())
              .toList();
        }

        return MyReportsResponse(
          data: filteredList,
          page: page,
          limit: limit,
          total: filteredList.length,
          counts: MyReportsCounts(
            total: totalCount,
            active: activeCount,
            fixed: fixedCount,
            rejected: rejectedCount,
          ),
        );
      }

      throw ReportSubmissionException('Failed to fetch personal reports (HTTP ${response.statusCode})');
    } on SocketException catch (e) {
      throw ReportSubmissionException('No network connection: ${e.message}');
    } on TimeoutException catch (e) {
      throw ReportSubmissionException('Request timed out: ${e.message}');
    } catch (e) {
      debugPrint('ApiService.fetchMyReports error: $e');
      rethrow;
    }
  }

  /// Fetch authenticated citizen's reputation score and level.
  /// Calls GET /api/v1/users/me/reputation.
  Future<UserReputationSummary> fetchMyReputation({String? authToken}) async {
    final rawUrl = baseUrl ?? dotenv.env['BACKEND_API_URL'] ?? '';
    if (rawUrl.isEmpty) {
      return const UserReputationSummary();
    }

    String? token = authToken;
    if (token == null || token.isEmpty) {
      try {
        token = Supabase.instance.client.auth.currentSession?.accessToken;
      } catch (e) {
        debugPrint('ApiService: Could not read Supabase session token: $e');
      }
    }

    if (token == null || token.isEmpty) {
      throw const NotAuthenticatedException();
    }

    var cleanBase = rawUrl.trim().replaceAll(RegExp(r'/+$'), '');
    final baseApi = cleanBase.endsWith('/api') ? cleanBase : '$cleanBase/api/v1';
    final uri = Uri.parse('$baseApi/users/me/reputation');

    try {
      final httpClient = client ?? http.Client();
      final headers = <String, String>{
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      };

      final response = await httpClient.get(uri, headers: headers).timeout(
        const Duration(seconds: 10),
      );

      if (response.statusCode == 200) {
        final dynamic decoded = jsonDecode(response.body);
        if (decoded is Map<String, dynamic>) {
          return UserReputationSummary.fromJson(decoded);
        }
      }

      if (response.statusCode == 401) {
        throw const NotAuthenticatedException();
      }

      return const UserReputationSummary();
    } catch (e) {
      debugPrint('ApiService.fetchMyReputation error: $e');
      return const UserReputationSummary();
    }
  }
}
