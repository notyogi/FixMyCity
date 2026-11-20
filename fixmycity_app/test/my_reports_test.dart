import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'package:fixmycity_app/db/sqlite_helper.dart';
import 'package:fixmycity_app/models/notification_model.dart';
import 'package:fixmycity_app/models/pending_report_model.dart';
import 'package:fixmycity_app/models/report_model.dart';
import 'package:fixmycity_app/providers/my_reports_provider.dart';
import 'package:fixmycity_app/providers/notifications_provider.dart';
import 'package:fixmycity_app/screens/my_reports_screen.dart';
import 'package:fixmycity_app/services/api_service.dart';

// ---------------- Mocks & Fakes ----------------

class MockApiService extends ApiService {
  MyReportsResponse? mockMyReportsResponse;
  UserReputationSummary? mockReputation;
  bool shouldThrowNetworkError = false;
  String? lastStatusParam;
  bool? lastActiveParam;
  int lastPageParam = 1;

  @override
  Future<MyReportsResponse> fetchMyReports({
    String? status,
    bool? active,
    int page = 1,
    int limit = 20,
    String? authToken,
  }) async {
    lastStatusParam = status;
    lastActiveParam = active;
    lastPageParam = page;

    if (shouldThrowNetworkError) {
      throw const ReportSubmissionException(
          'Check your internet connection and try again');
    }

    if (mockMyReportsResponse != null) {
      return mockMyReportsResponse!;
    }

    return const MyReportsResponse(
      data: [],
      page: 1,
      limit: 20,
      total: 0,
      counts: MyReportsCounts(),
    );
  }

  @override
  Future<UserReputationSummary> fetchMyReputation({String? authToken}) async {
    return mockReputation ??
        const UserReputationSummary(score: 15, level: 'ACTIVE');
  }
}

class FakeSQLiteHelper extends SQLiteHelper {
  final List<PendingReport> storage = [];

  FakeSQLiteHelper([List<PendingReport>? initial]) : super.internal() {
    if (initial != null) storage.addAll(initial);
  }

  @override
  Future<List<PendingReport>> getAllPendingReports(
      {bool autoRetryableOnly = false}) async {
    return List.from(storage);
  }

  @override
  Future<void> deletePendingReport(String id) async {
    storage.removeWhere((r) => r.id == id);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  final sampleDate = DateTime(2026, 11, 20, 10, 0);

  final sampleReport = ReportModel(
    id: 'rep-1',
    title: 'Pothole on Main St',
    description: 'Deep pothole damaging cars',
    category: 'Pothole',
    issueType: IssueType.POTHOLE,
    severity: Severity.HIGH,
    status: 'SUBMITTED',
    latitude: 12.9716,
    longitude: 77.5946,
    createdAt: sampleDate,
    confirmationCount: 3,
    clusterStatus: 'SUBMITTED',
    isSynced: true,
  );

  final sampleFixedReport = ReportModel(
    id: 'rep-fixed',
    title: 'Streetlight Fixed',
    description: 'Working now',
    category: 'Streetlight',
    issueType: IssueType.STREETLIGHT,
    severity: Severity.MEDIUM,
    status: 'FIXED',
    latitude: 12.9720,
    longitude: 77.5950,
    createdAt: sampleDate,
    isSynced: true,
  );

  final sampleRejectedReport = ReportModel(
    id: 'rep-rejected',
    title: 'Unactionable Issue',
    description: 'Outside municipal jurisdiction',
    category: 'Other',
    issueType: IssueType.OTHER,
    severity: Severity.LOW,
    status: 'REJECTED',
    latitude: 12.9730,
    longitude: 77.5960,
    createdAt: sampleDate,
    isSynced: true,
  );

  final samplePendingReport = PendingReport(
    id: 'pending-1',
    imageFilePath: '/tmp/test_image.jpg',
    latitude: 12.9740,
    longitude: 77.5970,
    issueType: 'DRAINAGE',
    severity: 'CRITICAL',
    notes: 'Blocked water drainage',
    nearSensitiveLocation: true,
    createdAt: sampleDate.toIso8601String(),
    syncStatus: 'pending',
  );

  // ---------------- 1. Data Model & Parsing Tests ----------------
  group('1. Data Models & Parsing Tests', () {
    test('ReportModel parses cluster_status and status_of_cluster correctly',
        () {
      final json = {
        'id': 'rep-cluster-1',
        'title': 'Test Report',
        'issue_type': 'POTHOLE',
        'severity': 'HIGH',
        'status': 'UNDER_REVIEW',
        'lat': 12.97,
        'lng': 77.59,
        'created_at': sampleDate.toIso8601String(),
        'cluster': {
          'id': 'cluster-abc',
          'confirmation_count': 5,
          'status_of_cluster': 'UNDER_REVIEW',
        },
      };

      final model = ReportModel.fromMap(json);
      expect(model.id, equals('rep-cluster-1'));
      expect(model.clusterId, equals('cluster-abc'));
      expect(model.confirmationCount, equals(5));
      expect(model.clusterStatus, equals('UNDER_REVIEW'));
      expect(model.isSynced, isTrue);
    });

    test('MyReportsCounts serializes and deserializes accurately', () {
      final json = {
        'total': 10,
        'active': 6,
        'fixed': 3,
        'rejected': 1,
      };

      final counts = MyReportsCounts.fromJson(json);
      expect(counts.total, equals(10));
      expect(counts.active, equals(6));
      expect(counts.fixed, equals(3));
      expect(counts.rejected, equals(1));

      expect(counts.toJson(), equals(json));
    });

    test('UserReputationSummary parses score and level accurately', () {
      final json = {'score': 42, 'level': 'TRUSTED'};
      final rep = UserReputationSummary.fromJson(json);
      expect(rep.score, equals(42));
      expect(rep.level, equals('TRUSTED'));
    });

    test('ApiService.fetchMyReports seamlessly falls back to legacy query on 404', () async {
      final client = MockClient((request) async {
        if (request.url.path.contains('/reports/mine')) {
          return http.Response('{"error":"Report not found"}', 404);
        }
        if (request.url.path.contains('/reports')) {
          return http.Response(
            jsonEncode({
              'data': [sampleReport.toMap(), sampleFixedReport.toMap()],
            }),
            200,
          );
        }
        return http.Response('Not found', 404);
      });

      final api = ApiService(baseUrl: 'https://example.com/api/v1', client: client);
      final res = await api.fetchMyReports(authToken: 'test-token');
      expect(res.data.length, equals(2));
      expect(res.counts.total, equals(2));
      expect(res.counts.active, equals(1));
      expect(res.counts.fixed, equals(1));
    });
  });

  // ---------------- 2. Queue Merging & Deduplication Tests ----------------
  group('2. Offline Queue Merging & Deduplication', () {
    test('pendingReportToModel maps SQLite PendingReport correctly', () {
      final model = pendingReportToModel(samplePendingReport);
      expect(model.id, equals('pending-1'));
      expect(model.issueType, equals(IssueType.DRAINAGE));
      expect(model.severity, equals(Severity.CRITICAL));
      expect(model.isSynced, isFalse);
      expect(model.status, equals('PENDING_SYNC'));
      expect(model.nearSensitiveLocation, isTrue);
    });

    test(
        'combineReports places pending items at the top and deduplicates IDs',
        () {
      final duplicatePending = PendingReport(
        id: 'rep-1', // same id as sampleReport (already synced)
        imageFilePath: '/tmp/dup.jpg',
        latitude: 12.0,
        longitude: 77.0,
        issueType: 'POTHOLE',
        severity: 'LOW',
        createdAt: sampleDate.toIso8601String(),
      );

      final combined = combineReports(
        pendingReports: [samplePendingReport, duplicatePending],
        serverReports: [sampleReport, sampleFixedReport],
        filter: MyReportsFilter.all,
      );

      // duplicatePending ('rep-1') must be omitted since sampleReport already has id 'rep-1'
      expect(combined.length, equals(3));
      // Pending report must be at index 0 (top of list)
      expect(combined[0].id, equals('pending-1'));
      expect(combined[0].isSynced, isFalse);
      expect(combined[1].id, equals('rep-1'));
      expect(combined[2].id, equals('rep-fixed'));
    });

    test('combineReports omits pending items when filter is Fixed or Closed',
        () {
      final combinedFixed = combineReports(
        pendingReports: [samplePendingReport],
        serverReports: [sampleFixedReport],
        filter: MyReportsFilter.fixed,
      );
      expect(combinedFixed.length, equals(1));
      expect(combinedFixed.first.id, equals('rep-fixed'));

      final combinedClosed = combineReports(
        pendingReports: [samplePendingReport],
        serverReports: [sampleRejectedReport],
        filter: MyReportsFilter.closed,
      );
      expect(combinedClosed.length, equals(1));
      expect(combinedClosed.first.id, equals('rep-rejected'));
    });
  });

  // ---------------- 3. Provider State & Filter Tests ----------------
  group('3. MyReportsNotifier Unit Tests', () {
    late ProviderContainer container;
    late MockApiService mockApiService;
    late FakeSQLiteHelper fakeSQLiteHelper;

    setUp(() {
      mockApiService = MockApiService();
      fakeSQLiteHelper = FakeSQLiteHelper();
      container = ProviderContainer(
        overrides: [
          myReportsProvider.overrideWith(() {
            return MyReportsNotifier(
              apiService: mockApiService,
              sqliteHelper: fakeSQLiteHelper,
            );
          }),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test(
        'fetchReports populates state with server reports, counts and reputation',
        () async {
      mockApiService.mockMyReportsResponse = MyReportsResponse(
        data: [sampleReport, sampleFixedReport],
        page: 1,
        limit: 20,
        total: 2,
        counts:
            const MyReportsCounts(total: 2, active: 1, fixed: 1, rejected: 0),
      );
      mockApiService.mockReputation =
          const UserReputationSummary(score: 25, level: 'ACTIVE');

      final notifier = container.read(myReportsProvider.notifier);
      await notifier.fetchReports();

      final state = container.read(myReportsProvider);
      expect(state.serverReports.length, equals(2));
      expect(state.counts.total, equals(2));
      expect(state.counts.active, equals(1));
      expect(state.counts.fixed, equals(1));
      expect(state.reputation.score, equals(25));
      expect(state.reputation.level, equals('ACTIVE'));
      expect(state.isOfflineWarning, isFalse);
    });

    test(
        'setFilter maps to active=true for inProgress and status=FIXED for fixed',
        () async {
      final notifier = container.read(myReportsProvider.notifier);

      await notifier.setFilter(MyReportsFilter.inProgress);
      expect(mockApiService.lastActiveParam, isTrue);
      expect(mockApiService.lastStatusParam, isNull);

      await notifier.setFilter(MyReportsFilter.fixed);
      expect(mockApiService.lastActiveParam, isNull);
      expect(mockApiService.lastStatusParam, equals('FIXED'));

      await notifier.setFilter(MyReportsFilter.closed);
      expect(mockApiService.lastActiveParam, isNull);
      expect(mockApiService.lastStatusParam, equals('REJECTED'));
    });

    test(
        'Network error with existing reports triggers offline warning banner',
        () async {
      mockApiService.mockMyReportsResponse = MyReportsResponse(
        data: [sampleReport],
        page: 1,
        limit: 20,
        total: 1,
        counts:
            const MyReportsCounts(total: 1, active: 1, fixed: 0, rejected: 0),
      );

      final notifier = container.read(myReportsProvider.notifier);
      await notifier.fetchReports();
      expect(container.read(myReportsProvider).serverReports.length, equals(1));

      // Now simulate network failure on refresh
      mockApiService.shouldThrowNetworkError = true;
      await notifier.fetchReports(isRefresh: true);

      final state = container.read(myReportsProvider);
      expect(state.isOfflineWarning, isTrue);
      expect(state.serverReports.length, equals(1));
    });

    test('clearOnLogout resets state to empty defaults', () async {
      mockApiService.mockMyReportsResponse = MyReportsResponse(
        data: [sampleReport],
        page: 1,
        limit: 20,
        total: 1,
        counts:
            const MyReportsCounts(total: 1, active: 1, fixed: 0, rejected: 0),
      );

      final notifier = container.read(myReportsProvider.notifier);
      await notifier.fetchReports();

      await notifier.clearOnLogout();

      final state = container.read(myReportsProvider);
      expect(state.reports, isEmpty);
      expect(state.serverReports, isEmpty);
      expect(state.counts.total, equals(0));
      expect(state.reputation.score, equals(0));
    });
  });

  // ---------------- 4. Widget Tests: MyReportsScreen ----------------
  group('4. MyReportsScreen Widget Tests', () {
    testWidgets('Renders empty state when citizen has no submitted reports',
        (tester) async {
      final mockApi = MockApiService();
      final fakeSqlite = FakeSQLiteHelper();
      mockApi.mockMyReportsResponse = const MyReportsResponse(
        data: [],
        page: 1,
        limit: 20,
        total: 0,
        counts: MyReportsCounts(),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            myReportsProvider.overrideWith(() {
              return MyReportsNotifier(
                apiService: mockApi,
                sqliteHelper: fakeSqlite,
              );
            }),
          ],
          child: const MaterialApp(
            home: MyReportsScreen(),
          ),
        ),
      );

      final notifier = ProviderScope.containerOf(
        tester.element(find.byType(MyReportsScreen)),
      ).read(myReportsProvider.notifier);
      await notifier.fetchReports();
      await tester.pump();

      expect(find.text("You haven't submitted any reports yet"), findsOneWidget);
      expect(find.text('File a Report'), findsOneWidget);
    });

    testWidgets(
        'Renders report card with progress stepper and unread update dot',
        (tester) async {
      final mockApi = MockApiService();
      final fakeSqlite = FakeSQLiteHelper();
      mockApi.mockMyReportsResponse = MyReportsResponse(
        data: [sampleReport, sampleRejectedReport],
        page: 1,
        limit: 20,
        total: 2,
        counts:
            const MyReportsCounts(total: 2, active: 1, fixed: 0, rejected: 1),
      );
      mockApi.mockReputation =
          const UserReputationSummary(score: 30, level: 'TRUSTED');

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            myReportsProvider.overrideWith(() {
              return MyReportsNotifier(
                apiService: mockApi,
                sqliteHelper: fakeSqlite,
              );
            }),
            notificationsProvider.overrideWith(() {
              return NotificationsNotifier(apiService: mockApi);
            }),
          ],
          child: const MaterialApp(
            home: MyReportsScreen(),
          ),
        ),
      );

      final notifier = ProviderScope.containerOf(
        tester.element(find.byType(MyReportsScreen)),
      ).read(myReportsProvider.notifier);
      await notifier.fetchReports();
      await tester.pump();

      // Check reputation header
      expect(find.text('Citizen Level: '), findsOneWidget);
      expect(find.text('TRUSTED'), findsOneWidget);
      expect(find.text('30 pts'), findsOneWidget);

      // Check Summary chips
      expect(find.text('Total'), findsOneWidget);
      expect(find.text('In progress'), findsWidgets);
      expect(find.text('Fixed'), findsWidgets);
      expect(find.text('Closed'), findsWidgets);

      // Check card rendering
      expect(find.text('Pothole on Main St'), findsOneWidget);
      expect(find.text('👥 3 people confirmed this cluster'), findsOneWidget);

      // Check 4-step progress stepper labels
      expect(find.text('Submitted'), findsWidgets);
      expect(find.text('Under review'), findsWidgets);
      expect(find.text('Scheduled'), findsWidgets);

      // Check neutral rejected label
      expect(find.text("Closed - couldn't be acted on"), findsOneWidget);

      // Verify bell icon button exists in AppBar
      expect(find.byIcon(Icons.notifications_outlined), findsOneWidget);
    });

    testWidgets('Tapping summary count chip triggers filter switch',
        (tester) async {
      final mockApi = MockApiService();
      final fakeSqlite = FakeSQLiteHelper();
      mockApi.mockMyReportsResponse = MyReportsResponse(
        data: [sampleReport, sampleFixedReport],
        page: 1,
        limit: 20,
        total: 2,
        counts:
            const MyReportsCounts(total: 2, active: 1, fixed: 1, rejected: 0),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            myReportsProvider.overrideWith(() {
              return MyReportsNotifier(
                apiService: mockApi,
                sqliteHelper: fakeSqlite,
              );
            }),
          ],
          child: const MaterialApp(
            home: MyReportsScreen(),
          ),
        ),
      );

      final notifier = ProviderScope.containerOf(
        tester.element(find.byType(MyReportsScreen)),
      ).read(myReportsProvider.notifier);
      await notifier.fetchReports();
      await tester.pump();

      // Tap 'Fixed' summary chip using its dedicated ValueKey
      final fixedChip = find.byKey(const ValueKey('summary_chip_fixed'));
      expect(fixedChip, findsOneWidget);
      await tester.tap(fixedChip);
      await tester.pump();

      expect(mockApi.lastStatusParam, equals('FIXED'));
    });
  });
}
