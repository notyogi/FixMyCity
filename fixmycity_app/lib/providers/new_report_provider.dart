import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/report_model.dart';

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

  /// Clears all fields after submission or cancellation.
  void reset() {
    state = const NewReportState();
  }

  /// Stub method for submitting the report.
  /// TODO: Implement actual Cloudinary upload + backend POST /api/v1/reports call
  /// in the upcoming milestone.
  Future<bool> submitReport() async {
    debugPrint('NewReportNotifier.submitReport() called with: $state');
    // TODO: Step 1: Upload image to Cloudinary via CloudinaryService
    // TODO: Step 2: POST /api/v1/reports with image_url, lat, lng, issue_type, severity
    await Future.delayed(const Duration(milliseconds: 300));
    return true;
  }
}

/// Global provider for the multi-step report creation flow.
final newReportProvider =
    NotifierProvider<NewReportNotifier, NewReportState>(NewReportNotifier.new);
