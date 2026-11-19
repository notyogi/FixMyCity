import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/notification_model.dart';
import '../services/api_service.dart';

/// State representation for in-app citizen status notifications.
@immutable
class NotificationsState {
  final List<NotificationModel> notifications;
  final int unreadCount;
  final bool isLoading;
  final bool isRefreshing;
  final bool isLoadingMore;
  final int page;
  final int total;
  final bool hasMore;
  final String? errorMessage;
  final bool isOfflineWarning;
  final bool unreadOnlyFilter;

  const NotificationsState({
    this.notifications = const [],
    this.unreadCount = 0,
    this.isLoading = false,
    this.isRefreshing = false,
    this.isLoadingMore = false,
    this.page = 1,
    this.total = 0,
    this.hasMore = false,
    this.errorMessage,
    this.isOfflineWarning = false,
    this.unreadOnlyFilter = false,
  });

  NotificationsState copyWith({
    List<NotificationModel>? notifications,
    int? unreadCount,
    bool? isLoading,
    bool? isRefreshing,
    bool? isLoadingMore,
    int? page,
    int? total,
    bool? hasMore,
    String? errorMessage,
    bool clearErrorMessage = false,
    bool? isOfflineWarning,
    bool? unreadOnlyFilter,
  }) {
    return NotificationsState(
      notifications: notifications ?? this.notifications,
      unreadCount: unreadCount ?? this.unreadCount,
      isLoading: isLoading ?? this.isLoading,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      page: page ?? this.page,
      total: total ?? this.total,
      hasMore: hasMore ?? this.hasMore,
      errorMessage: clearErrorMessage ? null : (errorMessage ?? this.errorMessage),
      isOfflineWarning: isOfflineWarning ?? this.isOfflineWarning,
      unreadOnlyFilter: unreadOnlyFilter ?? this.unreadOnlyFilter,
    );
  }
}

class NotificationsNotifier extends Notifier<NotificationsState> {
  ApiService? _customApiService;
  Timer? _unreadPollTimer;
  bool _isFetching = false;
  bool _isPolling = false;

  NotificationsNotifier({ApiService? apiService}) : _customApiService = apiService;

  ApiService get _apiService => _customApiService ?? ApiService();

  @visibleForTesting
  void setApiServiceForTest(ApiService service) {
    _customApiService = service;
  }

  @override
  NotificationsState build() {
    ref.onDispose(() {
      stopPolling();
    });
    return const NotificationsState();
  }

  /// Checks if the user is currently authenticated with Supabase.
  bool get _isAuthenticated {
    try {
      return Supabase.instance.client.auth.currentSession != null;
    } catch (_) {
      return false;
    }
  }

  /// Initial entrypoint: called when app starts or citizen logs in.
  Future<void> init() async {
    if (!_isAuthenticated) {
      clearOnLogout();
      return;
    }
    startPolling();
    await fetchNotifications();
  }

  /// Starts the lightweight 60-second periodic unread-count poll in the foreground.
  void startPolling() {
    stopPolling();
    if (!_isAuthenticated) return;

    _unreadPollTimer = Timer.periodic(const Duration(seconds: 60), (_) {
      pollUnreadCount();
    });
  }

  /// Stops the background polling timer.
  void stopPolling() {
    _unreadPollTimer?.cancel();
    _unreadPollTimer = null;
  }

  /// Called on app resume via WidgetsBindingObserver.
  Future<void> onResume() async {
    if (!_isAuthenticated) return;
    startPolling();
    await Future.wait([
      pollUnreadCount(),
      if (state.notifications.isNotEmpty)
        fetchNotifications(isRefresh: true, unreadOnly: state.unreadOnlyFilter),
    ]);
  }

  /// Called on app pause/backgrounding.
  void onPause() {
    stopPolling();
  }

  /// Lightweight poll for just the unread count.
  /// Skips if already fetching to prevent overlapping network requests.
  Future<void> pollUnreadCount() async {
    if (!_isAuthenticated || _isPolling || _isFetching) return;
    _isPolling = true;

    try {
      final count = await _apiService.fetchUnreadCount();
      state = state.copyWith(unreadCount: count);
    } catch (e) {
      debugPrint('NotificationsNotifier: Unread count polling failed silently: $e');
    } finally {
      _isPolling = false;
    }
  }

  /// Fetch first page or refresh notifications list.
  Future<void> fetchNotifications({
    bool isRefresh = false,
    bool? unreadOnly,
  }) async {
    if (_isFetching) return;
    _isFetching = true;

    final filter = unreadOnly ?? state.unreadOnlyFilter;

    if (isRefresh) {
      state = state.copyWith(
        isRefreshing: true,
        clearErrorMessage: true,
        isOfflineWarning: false,
        unreadOnlyFilter: filter,
      );
    } else {
      state = state.copyWith(
        isLoading: true,
        clearErrorMessage: true,
        isOfflineWarning: false,
        unreadOnlyFilter: filter,
      );
    }

    try {
      final response = await _apiService.fetchNotifications(
        unreadOnly: filter,
        page: 1,
        limit: 20,
      );

      state = state.copyWith(
        notifications: response.data,
        unreadCount: response.unreadCount,
        page: 1,
        total: response.total,
        hasMore: response.data.length < response.total,
        isLoading: false,
        isRefreshing: false,
        clearErrorMessage: true,
        isOfflineWarning: false,
        unreadOnlyFilter: filter,
      );
    } on SocketException catch (_) {
      _handleOfflineFailure();
    } catch (e) {
      if (e.toString().toLowerCase().contains('network') ||
          e.toString().toLowerCase().contains('connection') ||
          e.toString().toLowerCase().contains('socket')) {
        _handleOfflineFailure();
      } else {
        state = state.copyWith(
          isLoading: false,
          isRefreshing: false,
          errorMessage: e.toString(),
        );
      }
    } finally {
      _isFetching = false;
    }
  }

  void _handleOfflineFailure() {
    if (state.notifications.isNotEmpty) {
      // Keep last loaded data and show a small offline warning state
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        isOfflineWarning: true,
        clearErrorMessage: true,
      );
    } else {
      state = state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: "You're offline. Couldn't load notifications.",
      );
    }
  }

  /// Infinite scroll / pagination: loads next page of notifications.
  Future<void> loadMore() async {
    if (_isFetching || state.isLoadingMore || !state.hasMore) return;
    _isFetching = true;

    state = state.copyWith(isLoadingMore: true);
    final nextPage = state.page + 1;

    try {
      final response = await _apiService.fetchNotifications(
        unreadOnly: state.unreadOnlyFilter,
        page: nextPage,
        limit: 20,
      );

      final combined = [...state.notifications, ...response.data];
      state = state.copyWith(
        notifications: combined,
        unreadCount: response.unreadCount,
        page: nextPage,
        total: response.total,
        hasMore: combined.length < response.total,
        isLoadingMore: false,
      );
    } catch (e) {
      debugPrint('NotificationsNotifier.loadMore error: $e');
      state = state.copyWith(isLoadingMore: false);
    } finally {
      _isFetching = false;
    }
  }

  /// Toggle unread-only filter.
  Future<void> setUnreadOnlyFilter(bool unreadOnly) async {
    state = state.copyWith(unreadOnlyFilter: unreadOnly);
    await fetchNotifications(unreadOnly: unreadOnly);
  }

  /// Optimistic mark single notification as read with rollback on failure.
  Future<void> markAsRead(String id) async {
    final index = state.notifications.indexWhere((n) => n.id == id);
    if (index == -1) return;

    final target = state.notifications[index];
    if (target.isRead) return; // Already read

    // 1. Snapshot previous state for rollback
    final previousState = state;

    // 2. Apply optimistic local update
    final updatedList = List<NotificationModel>.from(state.notifications);
    updatedList[index] = target.copyWith(readAt: DateTime.now());
    final newUnreadCount = state.unreadCount > 0 ? state.unreadCount - 1 : 0;

    state = state.copyWith(
      notifications: updatedList,
      unreadCount: newUnreadCount,
    );

    // 3. Dispatch to backend API
    try {
      await _apiService.markNotificationRead(id);
    } catch (e) {
      debugPrint('NotificationsNotifier: Failed to mark read on server, rolling back: $e');
      // Rollback on network failure
      state = previousState;
    }
  }

  /// Optimistic mark all notifications as read with rollback on failure.
  Future<void> markAllAsRead() async {
    if (state.unreadCount == 0 && state.notifications.every((n) => n.isRead)) {
      return;
    }

    // 1. Snapshot previous state for rollback
    final previousState = state;

    // 2. Apply optimistic local update
    final now = DateTime.now();
    final updatedList = state.notifications
        .map((n) => n.isRead ? n : n.copyWith(readAt: now))
        .toList();

    state = state.copyWith(
      notifications: updatedList,
      unreadCount: 0,
    );

    // 3. Dispatch to backend API
    try {
      await _apiService.markAllNotificationsRead();
    } catch (e) {
      debugPrint('NotificationsNotifier: Failed to mark all read on server, rolling back: $e');
      state = previousState;
    }
  }

  /// Clear all state and stop polling on logout.
  void clearOnLogout() {
    stopPolling();
    state = const NotificationsState();
  }
}

/// Global provider for in-app notifications.
final notificationsProvider =
    NotifierProvider<NotificationsNotifier, NotificationsState>(
  NotificationsNotifier.new,
);
