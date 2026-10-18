import 'dart:async';
import 'dart:io';

import 'package:cloudinary_public/cloudinary_public.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';

/// ============================================================================
/// Cloudinary Upload Service
/// ============================================================================
/// Expected failure scenarios and suggested user-facing messages:
/// 1. Network Failure:
///    - Cause: Device offline, unstable mobile data/Wi-Fi, DNS lookup failure.
///    - Suggested message: "Network connection lost. Please check your internet connection and try again."
/// 2. Invalid / Missing Upload Preset (Misconfiguration):
///    - Cause: CLOUDINARY_CLOUD_NAME or CLOUDINARY_UPLOAD_PRESET missing/incorrect in .env, or preset is signed.
///    - Suggested message: "Image upload service is misconfigured. Please check your settings or contact support."
/// 3. File Not Found at Given Path:
///    - Cause: Provided local file path does not exist, was deleted, or cannot be read.
///    - Suggested message: "Could not find the selected image on your device. Please choose or capture another photo."
/// 4. Upload Timeout (30s exceeded):
///    - Cause: Upload took longer than 30 seconds due to low network bandwidth or server unresponsiveness.
///    - Suggested message: "Upload timed out, please check your connection and try again."
/// ============================================================================

/// Custom exception thrown when an image upload to Cloudinary fails.
class ImageUploadException implements Exception {
  final String message;

  const ImageUploadException(this.message);

  @override
  String toString() => message;
}

/// Service for uploading damage report photos via Cloudinary unsigned upload preset.
class CloudinaryService {
  /// Cached singleton-like instance for default environment configuration
  static CloudinaryPublic? _defaultClient;

  /// Optional client instance for custom overrides (useful in testing)
  CloudinaryPublic? _customClient;

  final String? _cloudNameOverride;
  final String? _uploadPresetOverride;

  /// Creates a [CloudinaryService].
  ///
  /// Optional [cloudName] and [uploadPreset] can be provided to override
  /// the values read from `dotenv.env`.
  CloudinaryService({String? cloudName, String? uploadPreset})
      : _cloudNameOverride = cloudName,
        _uploadPresetOverride = uploadPreset;

  /// Internal [CloudinaryPublic] instance initialized lazily once.
  CloudinaryPublic get _client {
    if (_cloudNameOverride != null || _uploadPresetOverride != null) {
      if (_customClient != null) return _customClient!;

      final cloudName =
          _cloudNameOverride ?? dotenv.env['CLOUDINARY_CLOUD_NAME']?.trim() ?? '';
      final uploadPreset =
          _uploadPresetOverride ?? dotenv.env['CLOUDINARY_UPLOAD_PRESET']?.trim() ?? '';

      if (cloudName.isEmpty || uploadPreset.isEmpty) {
        throw const ImageUploadException(
          'Cloudinary misconfigured: CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET '
          'must be configured.',
        );
      }

      _customClient = CloudinaryPublic(cloudName, uploadPreset, cache: false);
      return _customClient!;
    }

    if (_defaultClient != null) return _defaultClient!;

    final cloudName = dotenv.env['CLOUDINARY_CLOUD_NAME']?.trim() ?? '';
    final uploadPreset = dotenv.env['CLOUDINARY_UPLOAD_PRESET']?.trim() ?? '';

    if (cloudName.isEmpty || uploadPreset.isEmpty) {
      throw const ImageUploadException(
        'Cloudinary misconfigured: CLOUDINARY_CLOUD_NAME and CLOUDINARY_UPLOAD_PRESET '
        'must be configured in .env',
      );
    }

    _defaultClient = CloudinaryPublic(cloudName, uploadPreset, cache: false);
    return _defaultClient!;
  }

  /// Uploads an image file from a local path to Cloudinary and returns its secure HTTPS URL.
  ///
  /// [filePath] is the local path of the image on the device.
  /// [folder] optionally specifies a Cloudinary destination folder. When omitted or null,
  /// the upload preset's configured folder in the Cloudinary dashboard is preserved.
  Future<String> uploadImage(String filePath, {String? folder}) async {
    return uploadImageWithProgress(filePath, (_) {}, folder: folder);
  }

  /// Uploads an image file from a local path with upload progress reporting.
  ///
  /// [onProgress] receives fractional progress between 0.0 and 1.0.
  ///
  /// Progress tracking note:
  /// `cloudinary_public` supports progress callbacks through Dio's underlying
  /// `onSendProgress` parameter during the multipart HTTP upload. We normalize this
  /// count/total ratio into the `0.0` - `1.0` range. Additionally, `onProgress(0.0)` is
  /// called at start and `onProgress(1.0)` upon completion as a reliable fallback,
  /// ensuring UI progress indicators always transition predictably.
  Future<String> uploadImageWithProgress(
    String filePath,
    void Function(double progress) onProgress, {
    String? folder,
  }) async {
    final file = File(filePath);
    if (!file.existsSync()) {
      throw ImageUploadException(
        'Selected image file was not found on device: $filePath',
      );
    }

    try {
      onProgress(0.0);

      final client = _client;

      final response = await client
          .uploadFile(
            CloudinaryFile.fromFile(
              filePath,
              resourceType: CloudinaryResourceType.Image,
              folder: folder,
            ),
            onProgress: (count, total) {
              if (total > 0) {
                final progress = (count / total).clamp(0.0, 1.0);
                onProgress(progress);
              }
            },
          )
          .timeout(
            const Duration(seconds: 30),
            onTimeout: () {
              throw const ImageUploadException(
                'Upload timed out, please check your connection and try again',
              );
            },
          );

      onProgress(1.0);

      final secureUrl = response.secureUrl;
      if (secureUrl.isEmpty) {
        throw const ImageUploadException(
          'Cloudinary did not return a secure URL for the uploaded image.',
        );
      }

      return secureUrl;
    } on ImageUploadException {
      rethrow;
    } on TimeoutException {
      throw const ImageUploadException(
        'Upload timed out, please check your connection and try again',
      );
    } on CloudinaryException catch (e) {
      final msg = e.message ?? e.responseString;
      throw ImageUploadException('Cloudinary upload error (${e.statusCode}): $msg');
    } on SocketException catch (e) {
      throw ImageUploadException(
        'Network connection failed. Please check your internet connection: ${e.message}',
      );
    } catch (e) {
      final errStr = e.toString();
      if (errStr.toLowerCase().contains('timeout')) {
        throw const ImageUploadException(
          'Upload timed out, please check your connection and try again',
        );
      }
      if (errStr.toLowerCase().contains('socket') ||
          errStr.toLowerCase().contains('connection') ||
          errStr.toLowerCase().contains('network')) {
        throw ImageUploadException(
          'Network error during upload. Please check your connection: $e',
        );
      }
      throw ImageUploadException('Failed to upload image: $e');
    }
  }
}
