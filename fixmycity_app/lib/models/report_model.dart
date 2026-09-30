/// Model representing an infrastructure damage report in FixMyCity.
class ReportModel {
  final String id;
  final String title;
  final String description;
  final String category;
  final double latitude;
  final double longitude;
  final String? address;
  final String? imageUrl;
  final String status;
  final DateTime createdAt;
  final bool isSynced;
  final String? userId;

  const ReportModel({
    required this.id,
    required this.title,
    required this.description,
    required this.category,
    required this.latitude,
    required this.longitude,
    this.address,
    this.imageUrl,
    this.status = 'pending',
    required this.createdAt,
    this.isSynced = true,
    this.userId,
  });

  ReportModel copyWith({
    String? id,
    String? title,
    String? description,
    String? category,
    double? latitude,
    double? longitude,
    String? address,
    String? imageUrl,
    String? status,
    DateTime? createdAt,
    bool? isSynced,
    String? userId,
  }) {
    return ReportModel(
      id: id ?? this.id,
      title: title ?? this.title,
      description: description ?? this.description,
      category: category ?? this.category,
      latitude: latitude ?? this.latitude,
      longitude: longitude ?? this.longitude,
      address: address ?? this.address,
      imageUrl: imageUrl ?? this.imageUrl,
      status: status ?? this.status,
      createdAt: createdAt ?? this.createdAt,
      isSynced: isSynced ?? this.isSynced,
      userId: userId ?? this.userId,
    );
  }

  factory ReportModel.fromMap(Map<String, dynamic> map) {
    return ReportModel(
      id: map['id'] as String,
      title: map['title'] as String,
      description: map['description'] as String,
      category: map['category'] as String,
      latitude: (map['latitude'] as num).toDouble(),
      longitude: (map['longitude'] as num).toDouble(),
      address: map['address'] as String?,
      imageUrl: map['image_url'] as String?,
      status: (map['status'] as String?) ?? 'pending',
      createdAt: map['created_at'] is String
          ? DateTime.parse(map['created_at'] as String)
          : DateTime.fromMillisecondsSinceEpoch(map['created_at'] as int),
      isSynced: map['is_synced'] == 1 || map['is_synced'] == true,
      userId: map['user_id'] as String?,
    );
  }

  Map<String, dynamic> toMap() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'category': category,
      'latitude': latitude,
      'longitude': longitude,
      'address': address,
      'image_url': imageUrl,
      'status': status,
      'created_at': createdAt.toIso8601String(),
      'is_synced': isSynced ? 1 : 0,
      'user_id': userId,
    };
  }

  factory ReportModel.fromJson(Map<String, dynamic> json) =>
      ReportModel.fromMap(json);

  Map<String, dynamic> toJson() => toMap();
}
