import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import '../db/sqlite_helper.dart';
import '../models/pending_report_model.dart';
import '../models/report_model.dart';
import '../services/api_service.dart';
import '../services/sync_service.dart';

/// Supported filter tabs on the citizen's personal report dashboard.
enum MyReportsFilter {
  all('All'),
  inProgress('In progress'),
  fixed('Fixed'),
  closed('Closed');

  final String label;
  const MyReportsFilter(this.label);
}

/// Transforms an SQLite offline queued report into a unified [ReportModel].
ReportModel pendingReportToModel(PendingReport pending) {
  final issue = IssueType.fromString(pending.issueType);
  final sev = Severity.fromString(pending.severity);
  final isFailed = pending.syncStatus.toLowerCase() == 'failed';

  return ReportModel(
    id: pending.id,
    title: '${issue.displayName} (Queued)',
    description: pending.notes ?? '',
    category: issue.displayName,
    issueType: issue,
    severity: sev,
    notes: pending.notes,
    nearSensitiveLocation: pending.nearSensitiveLocation,
    latitude: pending.latitude,
    longitude: pending.longitude,
    imageUrl: pending.imageFilePath,
    status: isFailed ? 'FAILED_SYNC' : 'PENDING_SYNC',
    createdAt: DateTime.tryParse(pending.createdAt) ?? DateTime.now(),
    isSynced: false,
  );
}

/// Merges SQLite pending reports at the top with server reports, applying filter & deduplication.
List<ReportModel> combineReports({
  required List<PendingReport> pendingReports,
  required List<ReportModel> serverReports,
  required MyReportsFilter filter,
}) {
  List<ReportModel> pendingModels = [];
  // Pending items are by definition newly submitted/in progress
  if (filter == MyReportsFilter.all || filter == MyReportsFilter.inProgress) {
    pendingModels = pendingReports.map(pendingReportToModel).toList();
  }

  // Deduplicate against server reports if any share the same id
  final serverIds = serverReports.map((r) => r.id).toSet();
  final dedupedPending =
      pendingModels.where((p) => !serverIds.contains(p.id)).toList();

  return [...dedupedPending, ...serverReports];
}

/// State representation for the dedicated citizen personal reports screen.
@immutable
class MyReportsState {
  final List<ReportModel> reports; // Combined pending + server reports
  final List<PendingReport> pendingReports; // Offline SQLite queue items
  final List<ReportModel> serverReports; // Authenticated backend items
  final MyReportsFilter filter;
  final MyReportsCounts counts;
  final UserReputationSummary reputation;
  final bool isLoading;
  final bool isRefreshing;
  final bool isLoadingMore;
  final int page;
  final int total;
  final bool hasMore;
  final String? errorMessage;
  final bool isOfflineWarning;

  const MyReportsState({
    this.reports = const [],
    this.pendingReports = const [],
    this.serverReports = const [],
    this.filter = MyReportsFilter.all,
    this.counts = const MyReportsCounts(),
    this.reputation = const UserReputationSummary(),
    this.isLoading = false,
    this.isRefreshing = false,
    this.isLoadingMore = false,
    this.page = 1,
    this.total = 0,
    this.hasMore = false,
    this.errorMessage,
    this.isOfflineWarning = false,
  });

  MyReportsState copyWith({
    List<ReportModel>? reports,
    List<PendingReport>? pendingReports,
    List<ReportModel>? serverReports,
    MyReportsFilter? filter,
    MyReportsCounts? counts,
    UserReputationSummary? reputation,
    bool? isLoading,
    bool? isRefreshing,
    bool? isLoadingMore,
    int? page,
    int? total,
    bool? hasMore,
    String? errorMessage,
    bool clearErrorMessage = false,
    bool? isOfflineWarning,
  }) {
    return MyReportsState(
      reports: reports ?? this.reports,
      pendingReports: pendingReports ?? this.pendingReports,
      serverReports: serverReports ?? this.serverReports,
      filter: filter ?? this.filter,
      counts: counts ?? this.counts,
      reputation: reputation ?? this.reputation,
      isLoading: isLoading ?? this.isLoading,
      isRefreshing: isRefreshing ?? this.isRefreshing,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      page: page ?? this.page,
      total: total ?? this.total,
      hasMore: hasMore ?? this.hasMore,
      errorMessage:
          clearErrorMessage ? null : (errorMessage ?? this.errorMessage),
      isOfflineWarning: isOfflineWarning ?? this.isOfflineWarning,
    );
  }
}

/// Riverpod 3.x Notifier managing the citizen's personal report submissions.
class MyReportsNotifier extends Notifier<MyReportsState> {
  ApiService? _customApiService;
  SQLiteHelper? _customSqliteHelper;
  final SyncService? _customSyncService;
  VoidCallback? _syncListener;

  MyReportsNotifier({
    ApiService? apiService,
    SQLiteHelper? sqliteHelper,
    SyncService? syncService,
  })  : _customApiService = apiService,
        _customSqliteHelper = sqliteHelper,
        _customSyncService = syncService;

  ApiService get _apiService => _customApiService ?? ApiService();
  SQLiteHelper get _sqliteHelper =>
      _customSqliteHelper ?? SQLiteHelper.instance;
  SyncService get _syncService => _customSyncService ?? SyncService();

  @visibleForTesting
  void setApiServiceForTest(ApiService service) {
    _customApiService = service;
  }

  @visibleForTesting
  void setSqliteHelperForTest(SQLiteHelper helper) {
    _customSqliteHelper = helper;
  }

  @override
  MyReportsState build() {
    _syncListener = () {
      if (!_syncService.isSyncingNotifier.value) {
        // Background sync just completed: refresh offline queue and server list
        _loadPendingReports().then((_) {
          fetchReports(isRefresh: true);
        });
      }
    };
    _syncService.isSyncingNotifier.addListener(_syncListener!);

    ref.onDispose(() {
      if (_syncListener != null) {
        _syncService.isSyncingNotifier.removeListener(_syncListener!);
      }
    });

    return const MyReportsState();
  }

  /// Initial load: attempts cache hydration, reads SQLite pending items, and fetches fresh data.
  Future<void> init() async {
    // 1. Load pending reports
    await _loadPendingReports();

    // 2. Hydrate from disk cache if present
    await _loadFromCache();

    // 3. Fetch fresh data from network
    await fetchReports();
  }

  /// Reads pending reports from SQLite database.
  Future<void> _loadPendingReports() async {
    try {
      final pending = await _sqliteHelper.getAllPendingReports();
      final combined = combineReports(
        pendingReports: pending,
        serverReports: state.serverReports,
        filter: state.filter,
      );
      state = state.copyWith(
        pendingReports: pending,
        reports: combined,
      );
    } catch (e) {
      debugPrint('MyReportsNotifier: SQLite pending read error: $e');
    }
  }

  /// Fetches citizen personal reports for the given [filter].
  Future<void> fetchReports({
    bool isRefresh = false,
    MyReportsFilter? filter,
  }) async {
    final targetFilter = filter ?? state.filter;

    if (isRefresh) {
      state = state.copyWith(isRefreshing: true, clearErrorMessage: true);
    } else {
      state = state.copyWith(
        isLoading: true,
        clearErrorMessage: true,
        filter: targetFilter,
      );
    }

    // Refresh pending reports
    await _loadPendingReports();

    String? statusParam;
    bool? activeParam;
    switch (targetFilter) {
      case MyReportsFilter.all:
        break;
      case MyReportsFilter.inProgress:
        activeParam = true;
        break;
      case MyReportsFilter.fixed:
        statusParam = 'FIXED';
        break;
      case MyReportsFilter.closed:
        statusParam = 'REJECTED';
        break;
    }

    try {
      final response = await _apiService.fetchMyReports(
        status: statusParam,
        active: activeParam,
        page: 1,
        limit: 20,
      );

      // Fetch reputation summary
      UserReputationSummary rep = state.reputation;
      try {
        rep = await _apiService.fetchMyReputation();
      } catch (_) {}

      final combined = combineReports(
        pendingReports: state.pendingReports,
        serverReports: response.data,
        filter: targetFilter,
      );

      state = state.copyWith(
        serverReports: response.data,
        reports: combined,
        counts: response.counts,
        reputation: rep,
        page: 1,
        total: response.total,
        hasMore: response.data.length < response.total,
        isLoading: false,
        isRefreshing: false,
        isOfflineWarning: false,
        clearErrorMessage: true,
        filter: targetFilter,
      );

      // Persist first page to cache when on 'All' tab
      if (targetFilter == MyReportsFilter.all) {
        _writeCache(response.data, response.counts, rep);
      }
    } catch (e) {
      final hasData =
          state.serverReports.isNotEmpty || state.pendingReports.isNotEmpty;
      if (hasData) {
        final combined = combineReports(
          pendingReports: state.pendingReports,
          serverReports: state.serverReports,
          filter: targetFilter,
        );
        state = state.copyWith(
          reports: combined,
          isLoading: false,
          isRefreshing: false,
          isOfflineWarning: true,
        );
      } else {
        state = state.copyWith(
          isLoading: false,
          isRefreshing: false,
          errorMessage: e.toString(),
        );
      }
    }
  }

  /// Paginated infinite scrolling: loads the next page of reports.
  Future<void> loadMore() async {
    if (state.isLoadingMore ||
        !state.hasMore ||
        state.isLoading ||
        state.isRefreshing) {
      return;
    }

    state = state.copyWith(isLoadingMore: true);

    String? statusParam;
    bool? activeParam;
    switch (state.filter) {
      case MyReportsFilter.all:
        break;
      case MyReportsFilter.inProgress:
        activeParam = true;
        break;
      case MyReportsFilter.fixed:
        statusParam = 'FIXED';
        break;
      case MyReportsFilter.closed:
        statusParam = 'REJECTED';
        break;
    }

    final nextPage = state.page + 1;
    try {
      final response = await _apiService.fetchMyReports(
        status: statusParam,
        active: activeParam,
        page: nextPage,
        limit: 20,
      );

      final updatedServerReports = [...state.serverReports, ...response.data];
      final combined = combineReports(
        pendingReports: state.pendingReports,
        serverReports: updatedServerReports,
        filter: state.filter,
      );

      state = state.copyWith(
        serverReports: updatedServerReports,
        reports: combined,
        page: nextPage,
        hasMore: updatedServerReports.length < state.total,
        isLoadingMore: false,
      );
    } catch (e) {
      state = state.copyWith(isLoadingMore: false);
    }
  }

  /// Sets the active filter and refreshes the report list.
  Future<void> setFilter(MyReportsFilter newFilter) async {
    if (state.filter == newFilter && !state.isLoading) return;
    await fetchReports(filter: newFilter);
  }

  /// Retry syncing a single offline pending report.
  Future<bool> retryPendingReport(String id) async {
    final success = await _syncService.syncSingleReport(id);
    await _loadPendingReports();
    if (success) {
      await fetchReports(isRefresh: true);
    }
    return success;
  }

  /// Deletes an offline pending report from SQLite and removes its photo.
  Future<void> deletePendingReport(String id, String? localImagePath) async {
    try {
      await _sqliteHelper.deletePendingReport(id);
      if (localImagePath != null && localImagePath.isNotEmpty) {
        final file = File(localImagePath);
        if (await file.exists()) {
          await file.delete();
        }
      }
    } catch (e) {
      debugPrint('MyReportsNotifier: Failed to delete pending report: $e');
    }
    await _loadPendingReports();
  }

  /// Clears in-memory data and deletes the local cache on logout.
  Future<void> clearOnLogout() async {
    state = const MyReportsState();
    try {
      final file = await _resolveCacheFile();
      if (file != null && await file.exists()) {
        await file.delete();
      }
    } catch (e) {
      debugPrint('MyReportsNotifier: Failed to clear cache on logout: $e');
    }
  }

  // ---------------- Cache Persistence Helpers ----------------

  Future<File?> _resolveCacheFile() async {
    try {
      final dir = await getApplicationDocumentsDirectory();
      return File(p.join(dir.path, 'my_reports_cache.json'));
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeCache(
    List<ReportModel> reports,
    MyReportsCounts counts,
    UserReputationSummary reputation,
  ) async {
    try {
      final file = await _resolveCacheFile();
      if (file == null) return;
      final payload = {
        'data': reports.map((r) => r.toMap()).toList(),
        'counts': counts.toJson(),
        'reputation': reputation.toJson(),
        'cached_at': DateTime.now().toIso8601String(),
      };
      await file.writeAsString(jsonEncode(payload), flush: true);
    } catch (e) {
      debugPrint('MyReportsNotifier: Failed to write cache: $e');
    }
  }

  Future<bool> _loadFromCache() async {
    try {
      final file = await _resolveCacheFile();
      if (file == null || !await file.exists()) return false;
      final content = await file.readAsString();
      if (content.trim().isEmpty) return false;
      final decoded = jsonDecode(content);
      if (decoded is Map<String, dynamic>) {
        final rawData = decoded['data'] as List<dynamic>? ?? [];
        final cachedReports = rawData
            .whereType<Map<String, dynamic>>()
            .map((m) => ReportModel.fromMap(m))
            .toList();
        final cachedCounts = decoded['counts'] is Map<String, dynamic>
            ? MyReportsCounts.fromJson(
                decoded['counts'] as Map<String, dynamic>)
            : state.counts;
        final cachedRep = decoded['reputation'] is Map<String, dynamic>
            ? UserReputationSummary.fromJson(
                decoded['reputation'] as Map<String, dynamic>)
            : state.reputation;

        final combined = combineReports(
          pendingReports: state.pendingReports,
          serverReports: cachedReports,
          filter: state.filter,
        );

        state = state.copyWith(
          serverReports: cachedReports,
          reports: combined,
          counts: cachedCounts,
          reputation: cachedRep,
          total: cachedReports.length,
        );
        return true;
      }
    } catch (e) {
      debugPrint('MyReportsNotifier: Failed to load from cache: $e');
    }
    return false;
  }
}

/// Global provider for citizen personal reports.
final myReportsProvider =
    NotifierProvider<MyReportsNotifier, MyReportsState>(
  MyReportsNotifier.new,
);
