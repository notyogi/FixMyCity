import 'dart:convert';
import 'dart:io';

import 'package:fixmycity_app/db/sqlite_helper.dart';
import 'package:fixmycity_app/models/pending_report_model.dart';
import 'package:fixmycity_app/models/report_model.dart';
import 'package:fixmycity_app/providers/new_report_provider.dart';
import 'package:fixmycity_app/services/api_service.dart';
import 'package:fixmycity_app/services/cloudinary_service.dart';
import 'package:fixmycity_app/services/connectivity_service.dart';
import 'package:fixmycity_app/services/sync_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class FakeOfflineConnectivityService extends ConnectivityService {
  final bool online;

  FakeOfflineConnectivityService({this.online = false});

  @override
  Future<bool> isOnline() async => online;

  @override
  Stream<bool> get onConnectivityChanged => Stream.value(online);
}

class FakeSQLiteHelper extends SQLiteHelper {
  final List<PendingReport> storage = [];

  FakeSQLiteHelper() : super.internal();

  @override
  Future<void> insertPendingReport(PendingReport report) async {
    storage.add(report);
  }

  @override
  Future<List<PendingReport>> getAllPendingReports({bool autoRetryableOnly = false}) async {
    if (autoRetryableOnly) {
      return storage.where((r) => r.syncStatus != 'syncing' && r.retryCount <= 5).toList();
    }
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
  Future<void> incrementRetryCount(String id) async {
    final idx = storage.indexWhere((r) => r.id == id);
    if (idx != -1) {
      storage[idx] = storage[idx].copyWith(retryCount: storage[idx].retryCount + 1);
    }
  }

  @override
  Future<int> getPendingReportsCount() async => storage.length;
}

class FakeCloudinaryService extends CloudinaryService {
  final String fakeUrl;
  final bool shouldFail;

  FakeCloudinaryService({
    this.fakeUrl = 'https://res.cloudinary.com/test/offline_synced.jpg',
    this.shouldFail = false,
  });

  @override
  Future<String> uploadImage(String filePath, {String? folder}) async {
    if (shouldFail) {
      throw const ImageUploadException('Cloudinary simulated offline sync failure');
    }
    return fakeUrl;
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory mockDocsDir;

  setUpAll(() {
    mockDocsDir = Directory.systemTemp.createTempSync('mock_docs_');
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

  group('PendingReport model', () {
    test('toMap and fromMap work symmetrically', () {
      final report = PendingReport(
        id: 'test-uuid-123',
        imageFilePath: '/data/user/0/app/files/photo.jpg',
        latitude: 28.6139,
        longitude: 77.2090,
        issueType: 'POTHOLE',
        severity: 'CRITICAL',
        notes: 'Pothole on main lane',
        nearSensitiveLocation: true,
        createdAt: '2026-10-18T12:00:00Z',
        syncStatus: 'pending',
        retryCount: 1,
        lastError: 'Network error',
      );

      final map = report.toMap();
      expect(map['id'], 'test-uuid-123');
      expect(map['image_file_path'], '/data/user/0/app/files/photo.jpg');
      expect(map['latitude'], 28.6139);
      expect(map['longitude'], 77.2090);
      expect(map['issue_type'], 'POTHOLE');
      expect(map['severity'], 'CRITICAL');
      expect(map['notes'], 'Pothole on main lane');
      expect(map['near_sensitive_location'], 1);
      expect(map['created_at'], '2026-10-18T12:00:00Z');
      expect(map['sync_status'], 'pending');
      expect(map['retry_count'], 1);
      expect(map['last_error'], 'Network error');

      final fromMapReport = PendingReport.fromMap(map);
      expect(fromMapReport.id, report.id);
      expect(fromMapReport.imageFilePath, report.imageFilePath);
      expect(fromMapReport.latitude, report.latitude);
      expect(fromMapReport.longitude, report.longitude);
      expect(fromMapReport.issueType, report.issueType);
      expect(fromMapReport.severity, report.severity);
      expect(fromMapReport.notes, report.notes);
      expect(fromMapReport.nearSensitiveLocation, isTrue);
      expect(fromMapReport.createdAt, report.createdAt);
      expect(fromMapReport.syncStatus, report.syncStatus);
      expect(fromMapReport.retryCount, report.retryCount);
      expect(fromMapReport.lastError, report.lastError);
    });

    test('fromMap parses legacy record without near_sensitive_location as false', () {
      final legacyMap = {
        'id': 'legacy-uuid-1',
        'image_file_path': '/path/legacy.jpg',
        'latitude': 12.9716,
        'longitude': 77.5946,
        'issue_type': 'DRAINAGE',
        'severity': 'MEDIUM',
        'notes': 'Legacy report without location risk flag',
        'created_at': '2026-10-15T08:00:00Z',
        // 'near_sensitive_location' is omitted (as in pre-migration database rows)
      };

      final report = PendingReport.fromMap(legacyMap);
      expect(report.id, 'legacy-uuid-1');
      expect(report.nearSensitiveLocation, isFalse);
    });

    test('copyWith updates fields correctly', () {
      final report = PendingReport(
        id: 'test-1',
        imageFilePath: '/path/1.jpg',
        latitude: 10.0,
        longitude: 20.0,
        issueType: 'DRAINAGE',
        severity: 'MEDIUM',
        createdAt: '2026-10-18T10:00:00Z',
      );

      final updated = report.copyWith(
        syncStatus: 'failed',
        lastError: 'Upload timed out',
        retryCount: 2,
      );

      expect(updated.id, 'test-1');
      expect(updated.syncStatus, 'failed');
      expect(updated.lastError, 'Upload timed out');
      expect(updated.retryCount, 2);
    });
  });

  group('NewReportNotifier offline queueing', () {
    test('queues report locally and returns SubmitResult.queuedOffline when device is offline', () async {
      final tempDir = Directory.systemTemp.createTempSync('offline_test_');
      final tempPhoto = File('${tempDir.path}/captured_photo.jpg')
        ..writeAsStringSync('sample-image-bytes-data');

      addTearDown(() {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      });

      final fakeDb = FakeSQLiteHelper();
      final fakeConn = FakeOfflineConnectivityService(online: false);

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath(tempPhoto.path);
      notifier.setLocation(37.7749, -122.4194);
      notifier.setTags(
        issueType: IssueType.STREETLIGHT,
        severity: Severity.HIGH,
        notes: 'Streetlight flickers at night',
      );

      final result = await notifier.submitReport(
        connectivityService: fakeConn,
        sqliteHelper: fakeDb,
      );

      expect(result, SubmitResult.queuedOffline);

      // Verify report was inserted into SQLite
      expect(fakeDb.storage.length, 1);
      final queued = fakeDb.storage.first;
      expect(queued.issueType, 'STREETLIGHT');
      expect(queued.severity, 'HIGH');
      expect(queued.latitude, 37.7749);
      expect(queued.longitude, -122.4194);
      expect(queued.notes, 'Streetlight flickers at night');
      expect(queued.syncStatus, 'pending');

      // Verify persistent copy exists and contains the image data
      final persistentFile = File(queued.imageFilePath);
      expect(persistentFile.existsSync(), isTrue);
      expect(persistentFile.readAsStringSync(), 'sample-image-bytes-data');

      // Clean up persistent file
      if (persistentFile.existsSync()) {
        persistentFile.deleteSync();
      }

      // Verify provider state was reset
      final state = container.read(newReportProvider);
      expect(state.imageFilePath, isNull);
      expect(state.latitude, isNull);
      expect(state.nearSensitiveLocation, isFalse);
    });

    test('queues report with nearSensitiveLocation true when device is offline', () async {
      final tempDir = Directory.systemTemp.createTempSync('offline_risk_test_');
      final tempPhoto = File('${tempDir.path}/captured_photo_risk.jpg')
        ..writeAsStringSync('sample-image-bytes-risk');

      addTearDown(() {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      });

      final fakeDb = FakeSQLiteHelper();
      final fakeConn = FakeOfflineConnectivityService(online: false);

      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath(tempPhoto.path);
      notifier.setLocation(28.6139, 77.2090);
      notifier.setTags(
        issueType: IssueType.DRAINAGE,
        severity: Severity.CRITICAL,
        notes: 'Choked drain near civil hospital',
        nearSensitiveLocation: true,
      );

      final result = await notifier.submitReport(
        connectivityService: fakeConn,
        sqliteHelper: fakeDb,
      );

      expect(result, SubmitResult.queuedOffline);
      expect(fakeDb.storage.length, 1);
      final queued = fakeDb.storage.first;
      expect(queued.nearSensitiveLocation, isTrue);

      final persistentFile = File(queued.imageFilePath);
      if (persistentFile.existsSync()) {
        persistentFile.deleteSync();
      }
    });
  });

  group('SyncService syncPendingReports', () {
    test('successfully uploads photo, submits report, deletes DB record and local file', () async {
      final tempDir = Directory.systemTemp.createTempSync('sync_test_');
      final persistedPhoto = File('${tempDir.path}/persisted_report.jpg')
        ..writeAsStringSync('photo-file-bytes');

      addTearDown(() {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      });

      final fakeDb = FakeSQLiteHelper();
      fakeDb.storage.add(
        PendingReport(
          id: 'report-sync-1',
          imageFilePath: persistedPhoto.path,
          latitude: 28.5,
          longitude: 77.1,
          issueType: 'POTHOLE',
          severity: 'CRITICAL',
          notes: 'Urgent repair needed',
          createdAt: '2026-10-18T10:00:00Z',
          syncStatus: 'pending',
        ),
      );

      final fakeCloudinary = FakeCloudinaryService(
        fakeUrl: 'https://res.cloudinary.com/test/synced.jpg',
      );

      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        expect(body['image_url'], 'https://res.cloudinary.com/test/synced.jpg');
        expect(body['issue_type'], 'POTHOLE');
        expect(body['severity'], 'CRITICAL');
        return http.Response(
          jsonEncode({'id': 'server-created-report-1', 'status': 'SUBMITTED'}),
          201,
        );
      });

      final fakeApiService = ApiService(
        baseUrl: 'http://localhost:5001',
        client: mockClient,
      );

      final syncService = SyncService(
        sqliteHelper: fakeDb,
        cloudinaryService: fakeCloudinary,
        apiService: fakeApiService,
        connectivityService: FakeOfflineConnectivityService(online: true),
        authToken: 'mock-token',
      );

      await syncService.syncPendingReports();

      // Check DB: report should be deleted on success
      expect(fakeDb.storage, isEmpty);

      // Check local file: persisted file should be deleted on success
      expect(persistedPhoto.existsSync(), isFalse);
    });

    test('flag true survives being queued offline and is sent after sync', () async {
      final tempDir = Directory.systemTemp.createTempSync('sync_flag_true_');
      final persistedPhoto = File('${tempDir.path}/persisted_report.jpg')
        ..writeAsStringSync('photo-file-bytes');

      addTearDown(() {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      });

      final fakeDb = FakeSQLiteHelper();
      fakeDb.storage.add(
        PendingReport(
          id: 'report-sync-sensitive-1',
          imageFilePath: persistedPhoto.path,
          latitude: 28.5,
          longitude: 77.1,
          issueType: 'DRAINAGE',
          severity: 'HIGH',
          notes: 'Near government hospital',
          nearSensitiveLocation: true,
          createdAt: '2026-10-31T10:00:00Z',
          syncStatus: 'pending',
        ),
      );

      final fakeCloudinary = FakeCloudinaryService(
        fakeUrl: 'https://res.cloudinary.com/test/hospital_drain.jpg',
      );

      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        expect(body['near_sensitive_location'], true);
        return http.Response(
          jsonEncode({'id': 'synced-report-1', 'status': 'SUBMITTED', 'near_sensitive_location': true}),
          201,
        );
      });

      final syncService = SyncService(
        sqliteHelper: fakeDb,
        cloudinaryService: fakeCloudinary,
        apiService: ApiService(baseUrl: 'http://localhost:5001', client: mockClient),
        connectivityService: FakeOfflineConnectivityService(online: true),
        authToken: 'mock-token',
      );

      await syncService.syncPendingReports();

      expect(fakeDb.storage, isEmpty);
      expect(persistedPhoto.existsSync(), isFalse);
    });

    test('a row created before the migration (no column value) syncs with false', () async {
      final tempDir = Directory.systemTemp.createTempSync('sync_legacy_row_');
      final persistedPhoto = File('${tempDir.path}/legacy_report.jpg')
        ..writeAsStringSync('legacy-photo-bytes');

      addTearDown(() {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      });

      // Simulate a row parsed from pre-migration table where 'near_sensitive_location' column was absent
      final legacyRowMap = {
        'id': 'legacy-row-id-123',
        'image_file_path': persistedPhoto.path,
        'latitude': 28.5,
        'longitude': 77.1,
        'issue_type': 'POTHOLE',
        'severity': 'MEDIUM',
        'notes': 'Old pothole report before app update',
        'created_at': '2026-10-20T10:00:00Z',
        'sync_status': 'pending',
        'retry_count': 0,
        // Notice 'near_sensitive_location' is NOT in the map
      };

      final legacyPendingReport = PendingReport.fromMap(legacyRowMap);
      expect(legacyPendingReport.nearSensitiveLocation, isFalse);

      final fakeDb = FakeSQLiteHelper();
      fakeDb.storage.add(legacyPendingReport);

      final fakeCloudinary = FakeCloudinaryService(
        fakeUrl: 'https://res.cloudinary.com/test/legacy.jpg',
      );

      final mockClient = MockClient((request) async {
        final body = jsonDecode(request.body);
        // Must send false in request body
        expect(body['near_sensitive_location'], false);
        return http.Response(
          jsonEncode({'id': 'synced-legacy-1', 'status': 'SUBMITTED', 'near_sensitive_location': false}),
          201,
        );
      });

      final syncService = SyncService(
        sqliteHelper: fakeDb,
        cloudinaryService: fakeCloudinary,
        apiService: ApiService(baseUrl: 'http://localhost:5001', client: mockClient),
        connectivityService: FakeOfflineConnectivityService(online: true),
        authToken: 'mock-token',
      );

      await syncService.syncPendingReports();

      expect(fakeDb.storage, isEmpty);
      expect(persistedPhoto.existsSync(), isFalse);
    });

    test('increments retry count and sets status to failed when upload fails', () async {
      final tempDir = Directory.systemTemp.createTempSync('sync_fail_test_');
      final persistedPhoto = File('${tempDir.path}/persisted_fail.jpg')
        ..writeAsStringSync('photo-file-bytes');

      addTearDown(() {
        if (tempDir.existsSync()) {
          tempDir.deleteSync(recursive: true);
        }
      });

      final fakeDb = FakeSQLiteHelper();
      fakeDb.storage.add(
        PendingReport(
          id: 'report-fail-1',
          imageFilePath: persistedPhoto.path,
          latitude: 28.5,
          longitude: 77.1,
          issueType: 'GARBAGE',
          severity: 'LOW',
          createdAt: '2026-10-18T10:00:00Z',
          syncStatus: 'pending',
          retryCount: 0,
        ),
      );

      final fakeCloudinary = FakeCloudinaryService(shouldFail: true);

      final syncService = SyncService(
        sqliteHelper: fakeDb,
        cloudinaryService: fakeCloudinary,
        apiService: ApiService(baseUrl: 'http://localhost:5001'),
        connectivityService: FakeOfflineConnectivityService(online: true),
      );

      await syncService.syncPendingReports();

      // Report should remain in DB with status 'failed'
      expect(fakeDb.storage.length, 1);
      final failedItem = fakeDb.storage.first;
      expect(failedItem.syncStatus, 'failed');
      expect(failedItem.retryCount, 1);
      expect(failedItem.lastError, contains('Cloudinary simulated offline sync failure'));

      // Persistent photo file must NOT be deleted so retry remains possible
      expect(persistedPhoto.existsSync(), isTrue);
    });
  });
}
