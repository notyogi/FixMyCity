import 'dart:convert';
import 'dart:io';

import 'package:fixmycity_app/db/sqlite_helper.dart';
import 'package:fixmycity_app/models/pending_report_model.dart';
import 'package:fixmycity_app/models/report_model.dart';
import 'package:fixmycity_app/providers/new_report_provider.dart';
import 'package:fixmycity_app/services/api_service.dart';
import 'package:fixmycity_app/services/cloudinary_service.dart';
import 'package:fixmycity_app/services/connectivity_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeSQLiteHelper extends SQLiteHelper {
  final List<PendingReport> storage = [];

  FakeSQLiteHelper() : super.internal();

  @override
  Future<void> insertPendingReport(PendingReport report) async {
    storage.add(report);
  }

  @override
  Future<List<PendingReport>> getAllPendingReports({bool autoRetryableOnly = false}) async {
    return List.from(storage);
  }

  @override
  Future<PendingReport?> getPendingReportById(String id) async {
    try {
      return storage.firstWhere((r) => r.id == id);
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> deletePendingReport(String id) async {
    storage.removeWhere((r) => r.id == id);
  }

  @override
  Future<void> updateReportStatus(String id, String status, {String? error}) async {
    final idx = storage.indexWhere((r) => r.id == id);
    if (idx != -1) {
      storage[idx] = storage[idx].copyWith(syncStatus: status, lastError: error);
    }
  }

  @override
  Future<int> getPendingReportsCount() async => storage.length;
}

class FakeOnlineConnectivityService extends ConnectivityService {
  @override
  Future<bool> isOnline() async => true;

  @override
  Stream<bool> get onConnectivityChanged => Stream.value(true);
}

class FakeCloudinaryService extends CloudinaryService {
  final String fakeUrl;
  final bool shouldFail;

  FakeCloudinaryService({
    this.fakeUrl = 'https://res.cloudinary.com/test/image/upload/v1234/sample.jpg',
    this.shouldFail = false,
  });

  @override
  Future<String> uploadImage(String filePath, {String? folder}) async {
    if (shouldFail) {
      throw const ImageUploadException('Cloudinary upload simulated failure');
    }
    return fakeUrl;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory mockDocsDir;

  setUpAll(() {
    mockDocsDir = Directory.systemTemp.createTempSync('mock_submit_docs_');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (MethodCall methodCall) async {
        return mockDocsDir.path;
      },
    );
  });

  tearDownAll(() {
    if (mockDocsDir.existsSync()) {
      mockDocsDir.deleteSync(recursive: true);
    }
  });

  setUp(() {
    dotenv.loadFromString(
      envString: 'BACKEND_API_URL=http://localhost:5001\n'
          'CLOUDINARY_CLOUD_NAME=mock\n'
          'CLOUDINARY_UPLOAD_PRESET=mock',
    );
  });

  group('ApiService.submitReport', () {
    test('successful 201 response returns parsed report Map', () async {
      final mockClient = MockClient((request) async {
        expect(request.url.path, '/api/reports');
        expect(request.headers['Authorization'], 'Bearer mock-jwt-token');
        expect(request.headers['Content-Type'], contains('application/json'));

        final body = jsonDecode(request.body);
        expect(body['image_url'], 'https://example.com/photo.jpg');
        expect(body['lat'], 28.6139);
        expect(body['lng'], 77.2090);
        expect(body['issue_type'], 'POTHOLE');
        expect(body['severity'], 'CRITICAL');

        return http.Response(
          jsonEncode({
            'id': '11111111-2222-3333-4444-555555555555',
            'image_url': 'https://example.com/photo.jpg',
            'lat': 28.6139,
            'lng': 77.2090,
            'issue_type': 'POTHOLE',
            'severity': 'CRITICAL',
            'status': 'SUBMITTED',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      final result = await apiService.submitReport(
        imageUrl: 'https://example.com/photo.jpg',
        lat: 28.6139,
        lng: 77.2090,
        issueType: 'POTHOLE',
        severity: 'CRITICAL',
        authToken: 'mock-jwt-token',
      );

      expect(result['id'], '11111111-2222-3333-4444-555555555555');
      expect(result['status'], 'SUBMITTED');
    });

    test('successful 201 response with notes includes notes in payload', () async {
      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        expect(body['notes'], 'garbage needs to collected immediately');

        return http.Response(
          jsonEncode({
            'id': '11111111-2222-3333-4444-555555555555',
            'image_url': 'https://example.com/photo.jpg',
            'lat': 28.6139,
            'lng': 77.2090,
            'issue_type': 'POTHOLE',
            'severity': 'CRITICAL',
            'notes': 'garbage needs to collected immediately',
            'status': 'SUBMITTED',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      final result = await apiService.submitReport(
        imageUrl: 'https://example.com/photo.jpg',
        lat: 28.6139,
        lng: 77.2090,
        issueType: 'POTHOLE',
        severity: 'CRITICAL',
        notes: 'garbage needs to collected immediately',
        authToken: 'mock-jwt-token',
      );

      expect(result['notes'], 'garbage needs to collected immediately');
    });

    test('successful 201 response with nearSensitiveLocation true sends flag in payload', () async {
      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        expect(body['near_sensitive_location'], true);

        return http.Response(
          jsonEncode({
            'id': 'sensitive-loc-report-1',
            'image_url': 'https://example.com/photo.jpg',
            'lat': 28.6139,
            'lng': 77.2090,
            'issue_type': 'POTHOLE',
            'severity': 'CRITICAL',
            'near_sensitive_location': true,
            'status': 'SUBMITTED',
          }),
          201,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      final result = await apiService.submitReport(
        imageUrl: 'https://example.com/photo.jpg',
        lat: 28.6139,
        lng: 77.2090,
        issueType: 'POTHOLE',
        severity: 'CRITICAL',
        nearSensitiveLocation: true,
        authToken: 'mock-jwt-token',
      );

      expect(result['near_sensitive_location'], true);
    });

    test('401 response throws NotAuthenticatedException', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({'error': 'Unauthorized'}),
          401,
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      expect(
        () => apiService.submitReport(
          imageUrl: 'https://example.com/photo.jpg',
          lat: 28.6139,
          lng: 77.2090,
          issueType: 'POTHOLE',
          severity: 'CRITICAL',
          authToken: 'expired-token',
        ),
        throwsA(isA<NotAuthenticatedException>()),
      );
    });

    test('400 response parses validation errors into ReportSubmissionException', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': 'Validation failed',
            'details': [
              {'message': 'lat must be between -90 and 90'},
              {'message': 'severity must be one of: LOW, MEDIUM, HIGH, CRITICAL'},
            ],
          }),
          400,
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      expect(
        () => apiService.submitReport(
          imageUrl: 'https://example.com/photo.jpg',
          lat: 150.0,
          lng: 77.2090,
          issueType: 'POTHOLE',
          severity: 'INVALID',
          authToken: 'mock-token',
        ),
        throwsA(
          isA<ReportSubmissionException>().having(
            (e) => e.message,
            'message',
            contains('lat must be between -90 and 90'),
          ),
        ),
      );
    });

    test('unauthenticated call without token throws NotAuthenticatedException', () async {
      final apiService = ApiService(baseUrl: 'http://localhost:5001');

      expect(
        () => apiService.submitReport(
          imageUrl: 'https://example.com/photo.jpg',
          lat: 28.6139,
          lng: 77.2090,
          issueType: 'POTHOLE',
          severity: 'CRITICAL',
          // authToken is null, Supabase session not active
        ),
        throwsA(isA<NotAuthenticatedException>()),
      );
    });

    test('429 response throws RateLimitedException with retry_after_seconds from Retry-After header', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': 'Report limit reached',
            'limit': 10,
            'window': '1 hour',
            'retry_after_seconds': 450,
            'code': 'RATE_LIMITED',
          }),
          429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '450',
          },
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      expect(
        () => apiService.submitReport(
          imageUrl: 'https://example.com/photo.jpg',
          lat: 28.6139,
          lng: 77.2090,
          issueType: 'POTHOLE',
          severity: 'CRITICAL',
          authToken: 'mock-jwt-token',
        ),
        throwsA(
          isA<RateLimitedException>()
              .having((e) => e.retryAfterSeconds, 'retryAfterSeconds', 450)
              .having((e) => e.message, 'message', contains('Report limit reached')),
        ),
      );
    });

    test('429 response falls back to JSON body retry_after_seconds when header missing', () async {
      final mockClient = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': 'Report limit reached',
            'limit': 3,
            'window': '1 hour',
            'retry_after_seconds': 720,
            'code': 'RATE_LIMITED',
          }),
          429,
          headers: {'content-type': 'application/json'},
        );
      });

      final apiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      expect(
        () => apiService.submitReport(
          imageUrl: 'https://example.com/photo.jpg',
          lat: 28.6139,
          lng: 77.2090,
          issueType: 'POTHOLE',
          severity: 'CRITICAL',
          authToken: 'mock-jwt-token',
        ),
        throwsA(
          isA<RateLimitedException>()
              .having((e) => e.retryAfterSeconds, 'retryAfterSeconds', 720),
        ),
      );
    });
  });

  group('NewReportNotifier.submitReport orchestration', () {
    test('throws ReportSubmissionException when required state fields are missing', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);

      expect(
        () => notifier.submitReport(),
        throwsA(
          isA<ReportSubmissionException>().having(
            (e) => e.message,
            'message',
            contains('Photo is missing'),
          ),
        ),
      );

      notifier.setImagePath('/fake/photo.jpg');
      expect(
        () => notifier.submitReport(),
        throwsA(
          isA<ReportSubmissionException>().having(
            (e) => e.message,
            'message',
            contains('Location coordinates are missing'),
          ),
        ),
      );
    });

    test('full happy path uploads photo, submits report, reports stages, and resets state', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath('/fake/image.jpg');
      notifier.setLocation(28.6139, 77.2090);
      notifier.setTags(
        issueType: IssueType.POTHOLE,
        severity: Severity.CRITICAL,
      );
      notifier.setNotes('Large pothole near intersection');

      final stages = <String>[];
      final fakeCloudinary = FakeCloudinaryService(
        fakeUrl: 'https://res.cloudinary.com/test/image/upload/v1234/pothole.jpg',
      );

      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        expect(body['image_url'], 'https://res.cloudinary.com/test/image/upload/v1234/pothole.jpg');
        expect(body['issue_type'], 'POTHOLE');
        expect(body['severity'], 'CRITICAL');
        expect(body['notes'], 'Large pothole near intersection');
        return http.Response(
          jsonEncode({
            'id': 'test-report-id',
            'status': 'SUBMITTED',
            'notes': 'Large pothole near intersection',
          }),
          201,
        );
      });

      final fakeApiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      // We pass custom apiService and cloudinaryService
      final result = await notifier.submitReport(
        onStageChanged: (stage) => stages.add(stage),
        cloudinaryService: fakeCloudinary,
        apiService: fakeApiService,
        connectivityService: FakeOnlineConnectivityService(),
        authToken: 'mock-token',
      );

      // Verify stages
      expect(stages, ['Uploading photo...', 'Submitting report...']);
      expect(result, SubmitResult.sentOnline);

      // Verify state was reset
      final state = container.read(newReportProvider);
      expect(state.imageFilePath, isNull);
      expect(state.latitude, isNull);
      expect(state.issueType, isNull);
      expect(state.notes, isNull);
      expect(state.nearSensitiveLocation, isFalse);
    });

    test('online submission passes nearSensitiveLocation true through to backend', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath('/fake/image.jpg');
      notifier.setLocation(28.6139, 77.2090);
      notifier.setTags(
        issueType: IssueType.POTHOLE,
        severity: Severity.HIGH,
        nearSensitiveLocation: true,
      );

      final fakeCloudinary = FakeCloudinaryService(
        fakeUrl: 'https://res.cloudinary.com/test/image/upload/v1234/school_pothole.jpg',
      );

      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        expect(body['near_sensitive_location'], true);
        return http.Response(
          jsonEncode({
            'id': 'school-pothole-id',
            'status': 'SUBMITTED',
            'near_sensitive_location': true,
          }),
          201,
        );
      });

      final fakeApiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      final result = await notifier.submitReport(
        cloudinaryService: fakeCloudinary,
        apiService: fakeApiService,
        connectivityService: FakeOnlineConnectivityService(),
        authToken: 'mock-token',
      );

      expect(result, SubmitResult.sentOnline);
      final state = container.read(newReportProvider);
      expect(state.nearSensitiveLocation, isFalse);
    });

    test('propagates ImageUploadException when Cloudinary fails without clearing state', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath('/fake/image.jpg');
      notifier.setLocation(28.6139, 77.2090);
      notifier.setTags(
        issueType: IssueType.STREETLIGHT,
        severity: Severity.HIGH,
      );

      final fakeCloudinary = FakeCloudinaryService(shouldFail: true);

      expect(
        () => notifier.submitReport(
          cloudinaryService: fakeCloudinary,
          apiService: ApiService(baseUrl: 'http://localhost:5001'),
          connectivityService: FakeOnlineConnectivityService(),
        ),
        throwsA(isA<ImageUploadException>()),
      );

      // Confirm user state is kept intact for retry
      final state = container.read(newReportProvider);
      expect(state.imageFilePath, '/fake/image.jpg');
      expect(state.issueType, IssueType.STREETLIGHT);
    });

    test('429 on online submit offers to queue: saving to offline queue preserves details as pending with retryCount 0', () async {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final tempDir = Directory.systemTemp.createTempSync('online_429_test_');
      final tempPhoto = File('${tempDir.path}/temp_draft.jpg')..writeAsStringSync('sample photo');
      addTearDown(() {
        if (tempDir.existsSync()) tempDir.deleteSync(recursive: true);
      });

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath(tempPhoto.path);
      notifier.setLocation(28.6139, 77.2090);
      notifier.setTags(
        issueType: IssueType.DRAINAGE,
        severity: Severity.MEDIUM,
        notes: 'overflowing drain',
        nearSensitiveLocation: true,
      );

      final fakeCloudinary = FakeCloudinaryService();
      final mock429Client = MockClient((request) async {
        return http.Response(
          jsonEncode({
            'error': 'Report limit reached',
            'limit': 10,
            'window': '1 hour',
            'retry_after_seconds': 600,
            'code': 'RATE_LIMITED',
          }),
          429,
          headers: {'retry-after': '600', 'content-type': 'application/json'},
        );
      });

      final apiService429 = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mock429Client,
      );

      // Attempt online submit -> throws RateLimitedException
      await expectLater(
        () => notifier.submitReport(
          cloudinaryService: fakeCloudinary,
          apiService: apiService429,
          connectivityService: FakeOnlineConnectivityService(),
          authToken: 'mock-token',
        ),
        throwsA(isA<RateLimitedException>()),
      );

      // Verify draft state was NOT wiped when rate-limited
      final stateBeforeQueue = container.read(newReportProvider);
      expect(stateBeforeQueue.imageFilePath, tempPhoto.path);
      expect(stateBeforeQueue.issueType, IssueType.DRAINAGE);

      // Now invoke offer-to-queue helper (queueCurrentReportOffline)
      final fakeDb = FakeSQLiteHelper();
      await notifier.queueCurrentReportOffline(sqliteHelper: fakeDb);

      // State is now reset
      final stateAfterQueue = container.read(newReportProvider);
      expect(stateAfterQueue.hasPhoto, isFalse);

      // Offline queue has the saved report in 'pending' status with retryCount 0
      expect(fakeDb.storage.length, 1);
      final queued = fakeDb.storage.first;
      expect(queued.syncStatus, 'pending');
      expect(queued.retryCount, 0);
      expect(queued.issueType, 'DRAINAGE');
      expect(queued.severity, 'MEDIUM');
      expect(queued.notes, 'overflowing drain');
      expect(queued.nearSensitiveLocation, isTrue);
    });
  });
}
