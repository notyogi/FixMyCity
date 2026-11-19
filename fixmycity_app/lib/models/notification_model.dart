/// Model representing an in-app status notification for a citizen reporter.
class NotificationModel {
  final String id;
  final String reportId;
  final String? clusterId;
  final String title;
  final String body;
  final String? oldStatus;
  final String? newStatus;
  final DateTime? readAt;
  final DateTime createdAt;

  const NotificationModel({
    required this.id,
    required this.reportId,
    this.clusterId,
    required this.title,
    required this.body,
    this.oldStatus,
    this.newStatus,
    this.readAt,
    required this.createdAt,
  });

  /// Getter indicating whether this notification has been read.
  bool get isRead => readAt != null;

  NotificationModel copyWith({
    String? id,
    String? reportId,
    String? clusterId,
    String? title,
    String? body,
    String? oldStatus,
    String? newStatus,
    DateTime? readAt,
    DateTime? createdAt,
  }) {
    return NotificationModel(
      id: id ?? this.id,
      reportId: reportId ?? this.reportId,
      clusterId: clusterId ?? this.clusterId,
      title: title ?? this.title,
      body: body ?? this.body,
      oldStatus: oldStatus ?? this.oldStatus,
      newStatus: newStatus ?? this.newStatus,
      readAt: readAt ?? this.readAt,
      createdAt: createdAt ?? this.createdAt,
    );
  }

  /// Parses JSON from backend API, tolerating missing optional fields.
  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['id'] as String? ?? '',
      reportId: json['report_id'] as String? ?? json['reportId'] as String? ?? '',
      clusterId: json['cluster_id'] as String? ?? json['clusterId'] as String?,
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      oldStatus: json['old_status'] as String? ?? json['oldStatus'] as String?,
      newStatus: json['new_status'] as String? ?? json['newStatus'] as String?,
      readAt: json['read_at'] != null
          ? DateTime.tryParse(json['read_at'].toString())
          : (json['readAt'] != null
              ? DateTime.tryParse(json['readAt'].toString())
              : null),
      createdAt: json['created_at'] != null
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : (json['createdAt'] != null
              ? DateTime.tryParse(json['createdAt'].toString()) ?? DateTime.now()
              : DateTime.now()),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'report_id': reportId,
      'cluster_id': clusterId,
      'title': title,
      'body': body,
      'old_status': oldStatus,
      'new_status': newStatus,
      'read_at': readAt?.toIso8601String(),
      'created_at': createdAt.toIso8601String(),
    };
  }
}
