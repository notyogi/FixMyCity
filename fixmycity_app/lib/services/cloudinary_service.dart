import 'package:cloudinary_public/cloudinary_public.dart';

/// Service for uploading damage report photos via Cloudinary unsigned upload preset.
class CloudinaryService {
  final CloudinaryPublic? _cloudinary;

  CloudinaryService({String? cloudName, String? uploadPreset})
      : _cloudinary = (cloudName != null &&
                cloudName.isNotEmpty &&
                uploadPreset != null &&
                uploadPreset.isNotEmpty)
            ? CloudinaryPublic(cloudName, uploadPreset, cache: false)
            : null;

  /// Upload an image file from a local path to Cloudinary and return the secure public URL.
  Future<String?> uploadImage(String filePath) async {
    if (_cloudinary == null) {
      throw StateError(
          'Cloudinary is not configured. Check CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET.');
    }

    final response = await _cloudinary.uploadFile(
      CloudinaryFile.fromFile(
        filePath,
        resourceType: CloudinaryResourceType.Image,
        folder: 'fixmycity_reports',
      ),
    );

    return response.secureUrl;
  }
}
