import 'dart:convert';

import 'package:fixmycity_app/models/report_model.dart';
import 'package:fixmycity_app/providers/new_report_provider.dart';
import 'package:fixmycity_app/services/api_service.dart';
import 'package:fixmycity_app/services/cloudinary_service.dart';
import 'package:fixmycity_app/services/connectivity_service.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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
  });
}
