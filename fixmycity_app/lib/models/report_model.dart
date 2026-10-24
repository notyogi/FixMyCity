// ignore_for_file: constant_identifier_names

import 'package:flutter/material.dart';

/// IssueType mirroring backend Prisma schema enum
enum IssueType {
  POTHOLE,
  STREETLIGHT,
  GARBAGE,
  DRAINAGE,
  TRAFFIC_SIGNAL,
  SIDEWALK,
  OTHER;

  String get displayName {
    switch (this) {
      case IssueType.POTHOLE:
        return 'Pothole';
      case IssueType.STREETLIGHT:
        return 'Streetlight';
      case IssueType.GARBAGE:
        return 'Garbage';
      case IssueType.DRAINAGE:
        return 'Drainage';
      case IssueType.TRAFFIC_SIGNAL:
        return 'Traffic Signal';
      case IssueType.SIDEWALK:
        return 'Sidewalk';
      case IssueType.OTHER:
        return 'Other';
    }
  }

  IconData get icon {
    switch (this) {
      case IssueType.POTHOLE:
        return Icons.remove_road_rounded;
      case IssueType.STREETLIGHT:
        return Icons.lightbulb_outline_rounded;
      case IssueType.GARBAGE:
        return Icons.delete_outline_rounded;
      case IssueType.DRAINAGE:
        return Icons.water_damage_outlined;
      case IssueType.TRAFFIC_SIGNAL:
        return Icons.traffic_rounded;
      case IssueType.SIDEWALK:
        return Icons.directions_walk_rounded;
      case IssueType.OTHER:
        return Icons.report_problem_outlined;
    }
  }

  static IssueType fromString(String? value) {
    if (value == null) return IssueType.OTHER;
    return IssueType.values.firstWhere(
      (e) => e.name.toUpperCase() == value.trim().toUpperCase(),
      orElse: () => IssueType.OTHER,
    );
  }
}

/// Severity mirroring backend Prisma schema enum
enum Severity {
  LOW,
  MEDIUM,
  HIGH,
  CRITICAL;

  String get displayName {
    switch (this) {
      case Severity.LOW:
        return 'Low';
      case Severity.MEDIUM:
        return 'Medium';
      case Severity.HIGH:
        return 'High';
      case Severity.CRITICAL:
        return 'Critical';
    }
  }

  String get description {
    switch (this) {
      case Severity.LOW:
        return 'Minor issue, not urgent';
      case Severity.MEDIUM:
        return 'Noticeable problem affecting daily flow';
      case Severity.HIGH:
        return 'Substantial disruption or damage';
      case Severity.CRITICAL:
        return 'Immediate safety hazard';
    }
  }

  Color get color {
    switch (this) {
      case Severity.LOW:
        return Colors.green;
      case Severity.MEDIUM:
        return Colors.amber.shade800;
      case Severity.HIGH:
        return Colors.orange.shade900;
      case Severity.CRITICAL:
        return Colors.red.shade700;
    }
  }

  static Severity fromString(String? value) {
    if (value == null) return Severity.LOW;
    return Severity.values.firstWhere(
      (e) => e.name.toUpperCase() == value.trim().toUpperCase(),
      orElse: () => Severity.LOW,
    );
  }
}

/// Model representing an infrastructure damage report in FixMyCity.
class ReportModel {
  final String id;
  final String title;
  final String description;
  final String category;
  final IssueType issueType;
  final Severity severity;
  final String? notes;
  final double latitude;
  final double longitude;
  final String? address;
  final String? imageUrl;
  final String status;
  final DateTime createdAt;
  final bool isSynced;
  final String? userId;
  final String? userName;
  final String? clusterId;
  final int? confirmationCount;

  const ReportModel({
    required this.id,
    required this.title,
    required this.description,
    required this.category,
    this.issueType = IssueType.OTHER,
    this.severity = Severity.LOW,
    this.notes,
    required this.latitude,
    required this.longitude,
    this.address,
    this.imageUrl,
    this.status = 'SUBMITTED',
    required this.createdAt,
    this.isSynced = true,
    this.userId,
    this.userName,
    this.clusterId,
    this.confirmationCount,
  });

  /// User-friendly normalized status for UI filtering and badges:
  /// 'Active', 'In Progress', 'Resolved', or 'Rejected'
  String get normalizedStatus {
    final s = status.toUpperCase().trim();
    if (s == 'SUBMITTED' || s == 'PENDING' || s == 'ACTIVE') {
      return 'Active';
    }
    if (s == 'UNDER_REVIEW' || s == 'SCHEDULED' || s == 'IN_PROGRESS' || s == 'IN PROGRESS') {
      return 'In Progress';
    }
    if (s == 'FIXED' || s == 'RESOLVED') {
      return 'Resolved';
    }
    if (s == 'REJECTED') {
      return 'Rejected';
    }
    return status;
  }

  /// Theme color associated with the report's normalized status
  Color get statusColor {
    switch (normalizedStatus) {
      case 'Resolved':
        return Colors.green.shade700;
      case 'In Progress':
        return Colors.blue.shade700;
      case 'Rejected':
        return Colors.red.shade700;
      case 'Active':
      default:
        return Colors.orange.shade800;
    }
  }

  /// Relative human-readable timestamp (e.g. "2h ago", "Just now", "Oct 24, 2026")
  String get formattedTimeAgo {
    final now = DateTime.now();
    final difference = now.difference(createdAt);

    if (difference.inSeconds < 60) {
      return 'Just now';
    } else if (difference.inMinutes < 60) {
      final mins = difference.inMinutes;
      return '$mins min${mins > 1 ? 's' : ''} ago';
    } else if (difference.inHours < 24) {
      final hours = difference.inHours;
      return '$hours hr${hours > 1 ? 's' : ''} ago';
    } else if (difference.inDays < 7) {
      final days = difference.inDays;
      return '$days day${days > 1 ? 's' : ''} ago';
    } else {
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      final month = months[createdAt.month - 1];
      return '$month ${createdAt.day}, ${createdAt.year}';
    }
  }

  ReportModel copyWith({
    String? id,
    String? title,
    String? description,
    String? category,
    IssueType? issueType,
    Severity? severity,
    String? notes,
    double? latitude,
    double? longitude,
    String? address,
    String? imageUrl,
    String? status,
    DateTime? createdAt,
    bool? isSynced,
    String? userId,
    String? userName,
    String? clusterId,
    int? confirmationCount,
  }) {
    return ReportModel(
      id: id ?? this.id,
      title: title ?? this.title,
      description: description ?? this.description,
      category: category ?? this.category,
      issueType: issueType ?? this.issueType,
      severity: severity ?? this.severity,
      notes: notes ?? this.notes,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      address: address ?? this.address,
      imageUrl: imageUrl ?? this.imageUrl,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      isSynced: isSynced ?? this.isSynced,
      userId: userId ?? this.userId,
      userName: userName ?? this.userName,
      clusterId: clusterId ?? this.clusterId,
      confirmationCount: confirmationCount ?? this.confirmationCount,
    );
  }

  factory ReportModel.fromMap(Map<String, dynamic> map) {
    // Resolve issue type and severity
    final parsedIssueType = IssueType.fromString(
      (map['issue_type'] ?? map['category']) as String?,
    );
    final parsedSeverity = Severity.fromString(
      map['severity'] as String?,
    );

    // Resolve notes and description
    final notesVal = map['notes'] as String?;
    final descVal = (map['description'] as String?) ?? notesVal ?? '';

    // Generate readable title if not explicitly provided
    String titleVal = (map['title'] as String?) ?? '';
    if (titleVal.trim().isEmpty) {
      if (notesVal != null && notesVal.trim().isNotEmpty) {
        titleVal = '${parsedIssueType.displayName}: ${notesVal.trim()}';
      } else {
        titleVal = '${parsedIssueType.displayName} Reported';
      }
    }

    // Latitude & Longitude (supports both lat/lng and latitude/longitude)
    final latNum = (map['lat'] ?? map['latitude'] ?? 0.0) as num;
    final lngNum = (map['lng'] ?? map['longitude'] ?? 0.0) as num;

    // Cluster info (supports nested cluster or direct confirmation_count)
    String? clusterIdVal = map['cluster_id'] as String? ?? map['clusterId'] as String?;
    int? confirmCountVal;
    if (map['cluster'] is Map<String, dynamic>) {
      final clusterMap = map['cluster'] as Map<String, dynamic>;
      confirmCountVal = clusterMap['confirmation_count'] as int?;
      clusterIdVal ??= clusterMap['id'] as String?;
    } else if (map['confirmation_count'] is int) {
      confirmCountVal = map['confirmation_count'] as int;
    }

    // User name info
    String? userNameVal;
    if (map['user'] is Map<String, dynamic>) {
      userNameVal = map['user']['name'] as String?;
    } else {
      userNameVal = map['user_name'] as String?;
    }

    // Created At parsing
    DateTime createdAtVal;
    if (map['created_at'] is String) {
      createdAtVal = DateTime.tryParse(map['created_at'] as String) ?? DateTime.now();
    } else if (map['created_at'] is int) {
      createdAtVal = DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int);
    } else {
      createdAtVal = DateTime.now();
    }

    return ReportModel(
      id: (map['id'] ?? '').toString(),
      title: titleVal,
      description: descVal,
      category: parsedIssueType.displayName,
      issueType: parsedIssueType,
      severity: parsedSeverity,
      notes: notesVal,
      latitude: latNum.toDouble(),
      longitude: lngNum.toDouble(),
      address: map['address'] as String?,
      imageUrl: (map['image_url'] ?? map['imageUrl']) as String?,
      status: ((map['status'] as String?) ?? 'SUBMITTED'),
      createdAt: createdAtVal,
      isSynced: map['is_synced'] == 1 || map['is_synced'] == true,
      userId: (map['user_id'] ?? map['userId']) as String?,
      userName: userNameVal,
      clusterId: clusterIdVal,
      confirmationCount: confirmCountVal,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'category': category,
      'issue_type': issueType.name,
      'severity': severity.name,
      'notes': notes,
      'latitude': latitude,
      'longitude': longitude,
      'address': address,
      'image_url': imageUrl,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'is_synced': isSynced ? 1 : 0,
      'user_id': userId,
      'user_name': userName,
      'cluster_id': clusterId,
      'confirmation_count': confirmationCount,
    };
  }

  factory ReportModel.fromJson(Map<String, dynamic> json) =>
      ReportModel.fromMap(json);

  Map<String, dynamic> toJson() => toMap();
}
