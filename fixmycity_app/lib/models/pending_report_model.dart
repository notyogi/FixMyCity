/// Data model representing a damage report queued locally for offline synchronization.
class PendingReport {
  /// Unique local identifier (UUID) generated when the report is queued.
  final String id;

  /// Absolute file path of the photo copied to persistent app storage.
  final String imageFilePath;

  /// Geolocation coordinates.
  final double latitude;
  final double longitude;

  /// Uppercase issue type enum string (e.g. 'POTHOLE', 'STREETLIGHT').
  final String issueType;

  /// Uppercase severity enum string (e.g. 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL').
  final String severity;

  /// Optional citizen notes/description.
  final String? notes;

  /// Whether the report is located near a sensitive location (school, hospital, etc.).
  final bool nearSensitiveLocation;

  /// ISO 8601 string of when the report was queued locally.
  final String createdAt;

  /// Current sync status: 'pending', 'syncing', or 'failed'.
  final String syncStatus;

  /// Number of sync attempts made so far.
  final int retryCount;

  /// Human-readable error message from the most recent failed sync attempt.
  final String? lastError;

  const PendingReport({
    required this.id,
    required this.imageFilePath,
    required this.latitude,
    required this.longitude,
    required this.issueType,
    required this.severity,
    this.notes,
    this.nearSensitiveLocation = false,
    required this.createdAt,
    this.syncStatus = 'pending',
    this.retryCount = 0,
    this.lastError,
  });

  /// Converts the pending report into a Map suitable for SQLite insertion.
  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'image_file_path': imageFilePath,
      'latitude': latitude,
      'longitude': longitude,
      'issue_type': issueType,
      'severity': severity,
      'notes': notes,
      'near_sensitive_location': nearSensitiveLocation ? 1 : 0,
      'created_at': createdAt,
      'sync_status': syncStatus,
      'retry_count': retryCount,
      'last_error': lastError,
    };
  }

  /// Instantiates a [PendingReport] from an SQLite record map.
  factory PendingReport.fromMap(Map<String, dynamic> map) {
    final nearVal = map['near_sensitive_location'];
    final bool nearSensitiveLocation = nearVal == 1 || nearVal == true;

    return PendingReport(
      id: map['id'] as String,
      imageFilePath: map['image_file_path'] as String,
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      issueType: map['issue_type'] as String,
      severity: map['severity'] as String,
      notes: map['notes'] as String?,
      nearSensitiveLocation: nearSensitiveLocation,
      createdAt: map['created_at'] as String,
      syncStatus: (map['sync_status'] as String?) ?? 'pending',
      retryCount: (map['retry_count'] as int?) ?? 0,
      lastError: map['last_error'] as String?,
    );
  }

  PendingReport copyWith({
    String? id,
    String? imageFilePath,
    double? latitude,
    double? longitude,
    String? issueType,
    String? severity,
    String? notes,
    bool? nearSensitiveLocation,
    String? createdAt,
    String? syncStatus,
    int? retryCount,
    String? lastError,
  }) {
    return PendingReport(
      id: id ?? this.id,
      imageFilePath: imageFilePath ?? this.imageFilePath,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      issueType: issueType ?? this.issueType,
      severity: severity ?? this.severity,
      notes: notes ?? this.notes,
      nearSensitiveLocation: nearSensitiveLocation ?? this.nearSensitiveLocation,
      createdAt: createdAt ?? this.createdAt,
      syncStatus: syncStatus ?? this.syncStatus,
      retryCount: retryCount ?? this.retryCount,
      lastError: lastError ?? this.lastError,
    );
  }
}
