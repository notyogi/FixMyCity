import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:fixmycity_app/models/notification_model.dart';
import 'package:fixmycity_app/services/api_service.dart';
import 'package:fixmycity_app/providers/notifications_provider.dart';

class MockApiService extends ApiService {
  NotificationListResponse? mockListResponse;
  int? mockUnreadCount;
  bool shouldFailMarkRead = false;
  bool shouldFailMarkAllRead = false;
  int markReadCallCount = 0;
  int markAllReadCallCount = 0;

  @override
  Future<NotificationListResponse> fetchNotifications({
    bool unreadOnly = false,
    int page = 1,
    int limit = 20,
    String? authToken,
  }) async {
    if (mockListResponse != null) {
      return mockListResponse!;
    }
    return NotificationListResponse(
      data: [],
      page: page,
      limit: limit,
      total: 0,
      unreadCount: 0,
    );
  }

  @override
  Future<int> fetchUnreadCount({String? authToken}) async {
    return mockUnreadCount ?? 0;
  }

  @override
  Future<NotificationModel?> markNotificationRead(String id, {String? authToken}) async {
    markReadCallCount++;
    if (shouldFailMarkRead) {
      throw ReportSubmissionException('Failed to mark read on server');
    }
    return NotificationModel(
      id: id,
      reportId: 'rep-1',
      title: 'Updated',
      body: 'Updated body',
      readAt: DateTime.now(),
      createdAt: DateTime.now(),
    );
  }

  @override
  Future<int> markAllNotificationsRead({String? authToken}) async {
    markAllReadCallCount++;
    if (shouldFailMarkAllRead) {
      throw ReportSubmissionException('Failed to mark all read on server');
    }
    return 1;
  }
}

void main() {
  group('NotificationModel & Parsing Tests', () {
    test('NotificationModel parses complete JSON correctly and isRead works', () {
      final now = DateTime.now();
      final json = {
        'id': 'notif-1',
        'report_id': 'report-abc',
        'cluster_id': 'cluster-xyz',
        'type': 'STATUS_CHANGED',
        'title': 'Your report is under review',
        'body': 'Authorities have started reviewing your pothole report.',
        'old_status': 'SUBMITTED',
        'new_status': 'UNDER_REVIEW',
        'read_at': now.toIso8601String(),
        'created_at': now.subtract(const Duration(hours: 1)).toIso8601String(),
      };

      final model = NotificationModel.fromJson(json);

      expect(model.id, equals('notif-1'));
      expect(model.reportId, equals('report-abc'));
      expect(model.clusterId, equals('cluster-xyz'));
      expect(model.title, equals('Your report is under review'));
      expect(model.body, contains('pothole'));
      expect(model.oldStatus, equals('SUBMITTED'));
      expect(model.newStatus, equals('UNDER_REVIEW'));
      expect(model.isRead, isTrue);
      expect(model.readAt, isNotNull);
    });

    test('NotificationModel tolerates missing optional fields without crashing', () {
      final json = {
        'id': 'notif-minimal',
        'report_id': 'report-min',
        'title': 'Report closed',
        'body': 'Your report was closed.',
      };

      final model = NotificationModel.fromJson(json);

      expect(model.id, equals('notif-minimal'));
      expect(model.reportId, equals('report-min'));
      expect(model.clusterId, isNull);
      expect(model.oldStatus, isNull);
      expect(model.newStatus, isNull);
      expect(model.readAt, isNull);
      expect(model.isRead, isFalse);
    });

    test('NotificationListResponse parses list with total and unreadCount', () {
      final json = {
        'data': [
          {
            'id': 'n-1',
            'report_id': 'r-1',
            'title': 'Repair scheduled',
            'body': 'Repair scheduled for pothole',
            'new_status': 'SCHEDULED',
            'read_at': null,
          },
          {
            'id': 'n-2',
            'report_id': 'r-2',
            'title': 'Issue fixed',
            'body': 'Pothole marked as fixed',
            'new_status': 'FIXED',
            'read_at': DateTime.now().toIso8601String(),
          },
        ],
        'page': 1,
        'limit': 20,
        'total': 2,
        'unread_count': 1,
      };

      final response = NotificationListResponse.fromJson(json);

      expect(response.data.length, equals(2));
      expect(response.total, equals(2));
      expect(response.unreadCount, equals(1));
      expect(response.data[0].isRead, isFalse);
      expect(response.data[1].isRead, isTrue);
    });
  });

  group('NotificationsProvider Riverpod Tests', () {
    late ProviderContainer container;
    late MockApiService mockApiService;

    final unreadNotif = NotificationModel(
      id: 'notif-unread-1',
      reportId: 'rep-1',
      title: 'Under Review',
      body: 'Your pothole report is under review',
      newStatus: 'UNDER_REVIEW',
      readAt: null,
      createdAt: DateTime.now().subtract(const Duration(minutes: 5)),
    );

    final readNotif = NotificationModel(
      id: 'notif-read-2',
      reportId: 'rep-2',
      title: 'Issue Fixed',
      body: 'Your streetlight report is fixed',
      newStatus: 'FIXED',
      readAt: DateTime.now().subtract(const Duration(minutes: 10)),
      createdAt: DateTime.now().subtract(const Duration(minutes: 30)),
    );

    setUp(() {
      mockApiService = MockApiService();
      container = ProviderContainer(
        overrides: [
          notificationsProvider.overrideWith(() {
            return NotificationsNotifier(apiService: mockApiService);
          }),
        ],
      );
    });

    tearDown(() {
      container.dispose();
    });

    test('Initial state starts with 0 unread count and empty notifications', () {
      final state = container.read(notificationsProvider);
      expect(state.notifications, isEmpty);
      expect(state.unreadCount, equals(0));
      expect(state.isLoading, isFalse);
    });

    test('fetchNotifications populates state and unread badge count', () async {
      mockApiService.mockListResponse = NotificationListResponse(
        data: [unreadNotif, readNotif],
        page: 1,
        limit: 20,
        total: 2,
        unreadCount: 1,
      );

      final notifier = container.read(notificationsProvider.notifier);
      await notifier.fetchNotifications();

      final state = container.read(notificationsProvider);
      expect(state.notifications.length, equals(2));
      expect(state.unreadCount, equals(1));
      expect(state.total, equals(2));
    });

    test('Optimistic markAsRead decrements unread count and marks item read', () async {
      mockApiService.mockListResponse = NotificationListResponse(
        data: [unreadNotif, readNotif],
        page: 1,
        limit: 20,
        total: 2,
        unreadCount: 1,
      );

      final notifier = container.read(notificationsProvider.notifier);
      await notifier.fetchNotifications();

      expect(container.read(notificationsProvider).unreadCount, equals(1));
      expect(container.read(notificationsProvider).notifications[0].isRead, isFalse);

      await notifier.markAsRead(unreadNotif.id);

      final updatedState = container.read(notificationsProvider);
      expect(updatedState.unreadCount, equals(0));
      expect(updatedState.notifications[0].isRead, isTrue);
      expect(mockApiService.markReadCallCount, equals(1));
    });

    test('Optimistic markAsRead rolls back state when network API fails', () async {
      mockApiService.mockListResponse = NotificationListResponse(
        data: [unreadNotif, readNotif],
        page: 1,
        limit: 20,
        total: 2,
        unreadCount: 1,
      );
      mockApiService.shouldFailMarkRead = true; // Simulates server error

      final notifier = container.read(notificationsProvider.notifier);
      await notifier.fetchNotifications();

      expect(container.read(notificationsProvider).unreadCount, equals(1));
      expect(container.read(notificationsProvider).notifications[0].isRead, isFalse);

      await notifier.markAsRead(unreadNotif.id);

      // Verify rollback
      final rolledBackState = container.read(notificationsProvider);
      expect(rolledBackState.unreadCount, equals(1));
      expect(rolledBackState.notifications[0].isRead, isFalse);
    });

    test('Optimistic markAllAsRead zeroes unread count and rolls back on failure', () async {
      mockApiService.mockListResponse = NotificationListResponse(
        data: [unreadNotif, readNotif],
        page: 1,
        limit: 20,
        total: 2,
        unreadCount: 1,
      );

      final notifier = container.read(notificationsProvider.notifier);
      await notifier.fetchNotifications();

      // Successful mark all read
      await notifier.markAllAsRead();
      expect(container.read(notificationsProvider).unreadCount, equals(0));
      expect(container.read(notificationsProvider).notifications.every((n) => n.isRead), isTrue);

      // Reset and test rollback
      mockApiService.shouldFailMarkAllRead = true;
      notifier.setApiServiceForTest(mockApiService);
      await notifier.fetchNotifications();

      expect(container.read(notificationsProvider).unreadCount, equals(1));
      await notifier.markAllAsRead();

      // State rolled back
      expect(container.read(notificationsProvider).unreadCount, equals(1));
      expect(container.read(notificationsProvider).notifications[0].isRead, isFalse);
    });

    test('clearOnLogout resets state and stops polling', () async {
      mockApiService.mockListResponse = NotificationListResponse(
        data: [unreadNotif, readNotif],
        page: 1,
        limit: 20,
        total: 2,
        unreadCount: 1,
      );

      final notifier = container.read(notificationsProvider.notifier);
      await notifier.fetchNotifications();
      expect(container.read(notificationsProvider).notifications.length, equals(2));

      notifier.clearOnLogout();

      final clearedState = container.read(notificationsProvider);
      expect(clearedState.notifications, isEmpty);
      expect(clearedState.unreadCount, equals(0));
      expect(clearedState.errorMessage, isNull);
    });
  });
}
