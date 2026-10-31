import 'dart:io';

import 'package:flutter/foundation.dart';

import '../db/sqlite_helper.dart';
import '../models/pending_report_model.dart';
import 'api_service.dart';
import 'cloudinary_service.dart';
import 'connectivity_service.dart';

/// Service responsible for synchronizing offline queued damage reports once online.
class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService({
    SQLiteHelper? sqliteHelper,
    CloudinaryService? cloudinaryService,
    ApiService? apiService,
    ConnectivityService? connectivityService,
    String? authToken,
  }) {
    if (sqliteHelper != null) _instance._sqliteHelper = sqliteHelper;
    if (cloudinaryService != null) _instance._cloudinaryService = cloudinaryService;
    if (apiService != null) _instance._apiService = apiService;
    if (connectivityService != null) _instance._connectivityService = connectivityService;
    if (authToken != null) _instance._authToken = authToken;
    return _instance;
  }

  SyncService._internal();

  SQLiteHelper _sqliteHelper = SQLiteHelper.instance;
  CloudinaryService _cloudinaryService = CloudinaryService();
  ApiService _apiService = ApiService();
  ConnectivityService _connectivityService = ConnectivityService();
  String? _authToken;

  bool _isSyncing = false;

  /// Whether a sync batch is currently in progress.
  bool get isSyncing => _isSyncing;

  /// Notifier for listening to sync activity across UI components.
  final ValueNotifier<bool> isSyncingNotifier = ValueNotifier<bool>(false);

  /// Synchronizes all eligible pending reports sequentially.
  ///
  /// If [retryFailedExceeded] is true, also retries reports that have previously
  /// exceeded the maximum auto-retry limit (> 5 retries).
  Future<void> syncPendingReports({bool retryFailedExceeded = false}) async {
    // Prevent overlapping sync executions
    if (_isSyncing) {
      debugPrint('SyncService: Sync pass already running, skipping duplicate call.');
      return;
    }

    final online = await _connectivityService.isOnline();
    if (!online) {
      debugPrint('SyncService: Device is offline, skipping sync.');
      return;
    }

    _isSyncing = true;
    isSyncingNotifier.value = true;

    try {
      final reports = await _sqliteHelper.getAllPendingReports(
        autoRetryableOnly: !retryFailedExceeded,
      );

      if (reports.isEmpty) {
        debugPrint('SyncService: No pending reports to sync.');
        return;
      }

      debugPrint('SyncService: Starting sync of ${reports.length} pending report(s)...');

      for (final report in reports) {
        await _syncItem(report);
      }
    } catch (e, stackTrace) {
      debugPrint('SyncService: Error during batch sync: $e\n$stackTrace');
    } finally {
      _isSyncing = false;
      isSyncingNotifier.value = false;
    }
  }

  /// Retries synchronization for a single specific pending report.
  Future<bool> syncSingleReport(String id) async {
    final report = await _sqliteHelper.getPendingReportById(id);
    if (report == null) return false;

    final online = await _connectivityService.isOnline();
    if (!online) {
      debugPrint('SyncService: Device offline, cannot retry report $id');
      return false;
    }

    return await _syncItem(report);
  }

  /// Synchronizes a single report item. Returns true if successful.
  Future<bool> _syncItem(PendingReport report) async {
    try {
      await _sqliteHelper.updateReportStatus(report.id, 'syncing');

      final localImageFile = File(report.imageFilePath);
      if (!localImageFile.existsSync()) {
        const error = 'Local image file not found on device';
        debugPrint('SyncService: Failed for report ${report.id}: $error');
        await _sqliteHelper.incrementRetryCount(report.id);
        await _sqliteHelper.updateReportStatus(
          report.id,
          'failed',
          error: error,
        );
        return false;
      }

      // Step 1: Upload photo to Cloudinary
      debugPrint('SyncService: Uploading photo for report ${report.id}...');
      final imageUrl = await _cloudinaryService.uploadImage(report.imageFilePath);

      // Step 2: Submit report to Express backend
      debugPrint('SyncService: Posting report ${report.id} to backend...');
      await _apiService.submitReport(
        imageUrl: imageUrl,
        lat: report.latitude,
        lng: report.longitude,
        issueType: report.issueType,
        severity: report.severity,
        notes: report.notes,
        nearSensitiveLocation: report.nearSensitiveLocation,
        authToken: _authToken,
      );

      // Step 3: Success — clean up local database and persistent photo file
      debugPrint('SyncService: Report ${report.id} synced successfully! Cleaning up local cache...');
      await _sqliteHelper.deletePendingReport(report.id);

      try {
        if (localImageFile.existsSync()) {
          await localImageFile.delete();
          debugPrint('SyncService: Deleted local file ${report.imageFilePath}');
        }
      } catch (fileErr) {
        debugPrint('SyncService: Note: Could not delete local file ${report.imageFilePath}: $fileErr');
      }

      return true;
    } catch (e) {
      final errorMsg = e is ImageUploadException
          ? e.message
          : e is ReportSubmissionException
              ? e.message
              : e.toString();

      debugPrint('SyncService: Sync failed for report ${report.id}: $errorMsg');
      await _sqliteHelper.incrementRetryCount(report.id);
      await _sqliteHelper.updateReportStatus(
        report.id,
        'failed',
        error: errorMsg,
      );
      return false;
    }
  }
}
