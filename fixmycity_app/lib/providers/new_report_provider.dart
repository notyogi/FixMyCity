import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../db/sqlite_helper.dart';
import '../models/pending_report_model.dart';
import '../models/report_model.dart';
import '../services/api_service.dart';
import '../services/cloudinary_service.dart';
import '../services/connectivity_service.dart';

/// Result status of a report submission attempt.
enum SubmitResult {
  /// The report was successfully uploaded to Cloudinary and posted to the backend API.
  sentOnline,

  /// The device is offline; the report was safely persisted locally to SQLite to sync later.
  queuedOffline,
}

/// Immutable state holding all data gathered during report submission flow.
@immutable
class NewReportState {
  final String? imageFilePath;
  final double? latitude;
  final double? longitude;
  final IssueType? issueType;
  final Severity? severity;
  final String? notes;

  const NewReportState({
    this.imageFilePath,
    this.latitude,
    this.longitude,
    this.issueType,
    this.severity,
    this.notes,
  });

  NewReportState copyWith({
    String? imageFilePath,
    double? latitude,
    double? longitude,
    IssueType? issueType,
    Severity? severity,
    String? notes,
  }) {
    return NewReportState(
      imageFilePath: imageFilePath ?? this.imageFilePath,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      issueType: issueType ?? this.issueType,
      severity: severity ?? this.severity,
      notes: notes ?? this.notes,
    );
  }

  bool get hasLocation => latitude != null && longitude != null;
  bool get hasPhoto => imageFilePath != null && imageFilePath!.isNotEmpty;
  bool get hasTags => issueType != null && severity != null;
  bool get isReadyToSubmit => hasPhoto && hasLocation && hasTags;

  @override
  String toString() {
    return 'NewReportState(image: $imageFilePath, lat: $latitude, lng: $longitude, issue: $issueType, severity: $severity, notes: $notes)';
  }
}

/// Riverpod Notifier managing new report creation across multi-step screens.
class NewReportNotifier extends Notifier<NewReportState> {
  @override
  NewReportState build() {
    return const NewReportState();
  }

  void setImagePath(String path) {
    state = state.copyWith(imageFilePath: path);
  }

  void setLocation(double lat, double lng) {
    state = state.copyWith(latitude: lat, longitude: lng);
  }

  void setTags({
    required IssueType issueType,
    required Severity severity,
    String? notes,
  }) {
    state = state.copyWith(
      issueType: issueType,
      severity: severity,
      notes: notes,
    );
  }

  void updateNotes(String notes) {
    state = state.copyWith(notes: notes);
  }

  void setNotes(String? notes) {
    state = state.copyWith(notes: notes);
  }

  /// Clears all fields after submission or cancellation.
  void reset() {
    state = const NewReportState();
  }

  /// Copies a temporary camera/gallery photo to a permanent application storage
  /// directory so the OS cannot purge it before offline synchronization completes.
  Future<String> _persistImageFile(String tempPath, String reportId) async {
    final originalFile = File(tempPath);
    if (!originalFile.existsSync()) {
      throw ReportSubmissionException(
        'Cannot queue report offline: Photo file not found at $tempPath',
      );
    }

    final docsDir = await getApplicationDocumentsDirectory();
    final persistentFolder = Directory(p.join(docsDir.path, 'pending_report_photos'));
    if (!persistentFolder.existsSync()) {
      await persistentFolder.create(recursive: true);
    }

    final ext = p.extension(tempPath).isNotEmpty ? p.extension(tempPath) : '.jpg';
    final targetPath = p.join(persistentFolder.path, '$reportId$ext');

    await originalFile.copy(targetPath);
    return targetPath;
  }

  /// Orchestrates the full report submission pipeline with offline queueing support:
  ///
  /// 1. Validates presence of imageFilePath, latitude, longitude, issueType, and severity.
  /// 2. Checks connectivity via [ConnectivityService.isOnline].
  /// 3. If online:
  ///    - Uploads photo to Cloudinary via [CloudinaryService.uploadImage].
  ///    - Submits report to backend via [ApiService.submitReport].
  ///    - Clears provider state on success and returns [SubmitResult.sentOnline].
  /// 4. If offline:
  ///    - Copies temporary photo file into permanent app documents storage.
  ///    - Inserts report into local SQLite `pending_reports` table.
  ///    - Clears provider state on success and returns [SubmitResult.queuedOffline].
  Future<SubmitResult> submitReport({
    void Function(String stage)? onStageChanged,
    CloudinaryService? cloudinaryService,
    ApiService? apiService,
    ConnectivityService? connectivityService,
    SQLiteHelper? sqliteHelper,
    String? authToken,
  }) async {
    final imagePath = state.imageFilePath;
    final lat = state.latitude;
    final lng = state.longitude;
    final issueType = state.issueType;
    final severity = state.severity;
    final notes = state.notes;

    // Step 1: Validate required fields
    if (imagePath == null || imagePath.isEmpty) {
      throw const ReportSubmissionException('Cannot submit report: Photo is missing.');
    }
    if (lat == null || lng == null) {
      throw const ReportSubmissionException('Cannot submit report: Location coordinates are missing.');
    }
    if (issueType == null) {
      throw const ReportSubmissionException('Cannot submit report: Issue type is missing.');
    }
    if (severity == null) {
      throw const ReportSubmissionException('Cannot submit report: Severity is missing.');
    }

    // Step 2: Check network connectivity
    final conn = connectivityService ?? ConnectivityService();
    final isOnline = await conn.isOnline();

    if (!isOnline) {
      onStageChanged?.call('Saving offline...');
      final dbHelper = sqliteHelper ?? SQLiteHelper.instance;
      final reportId = const Uuid().v4();

      // Persist local file to prevent OS from wiping temp cache
      final persistentImagePath = await _persistImageFile(imagePath, reportId);

      final pendingReport = PendingReport(
        id: reportId,
        imageFilePath: persistentImagePath,
        latitude: lat,
        longitude: lng,
        issueType: issueType.name,
        severity: severity.name,
        notes: notes,
        createdAt: DateTime.now().toIso8601String(),
        syncStatus: 'pending',
        retryCount: 0,
      );

      await dbHelper.insertPendingReport(pendingReport);

      // Clear state and return offline queued status
      reset();
      return SubmitResult.queuedOffline;
    }

    // Online submission path
    onStageChanged?.call('Uploading photo...');
    final cloudService = cloudinaryService ?? CloudinaryService();
    final imageUrl = await cloudService.uploadImage(imagePath);

    onStageChanged?.call('Submitting report...');
    final service = apiService ?? ApiService();
    await service.submitReport(
      imageUrl: imageUrl,
      lat: lat,
      lng: lng,
      issueType: issueType.name,
      severity: severity.name,
      notes: notes,
      authToken: authToken,
    );

    // Step 4: Clear state on success
    reset();
    return SubmitResult.sentOnline;
  }
}

/// Global provider for the multi-step report creation flow.
final newReportProvider =
    NotifierProvider<NewReportNotifier, NewReportState>(NewReportNotifier.new);
