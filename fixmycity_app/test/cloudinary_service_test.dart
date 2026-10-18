import 'dart:io';

import 'package:fixmycity_app/services/cloudinary_service.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUp(() {
    dotenv.loadFromString(
      envString: 'CLOUDINARY_CLOUD_NAME=mock\nCLOUDINARY_UPLOAD_PRESET=mock',
    );
  });

  group('CloudinaryService Tests', () {
    test('ImageUploadException holds message correctly', () {
      const exception = ImageUploadException('Custom upload failure message');
      expect(exception.message, 'Custom upload failure message');
      expect(exception.toString(), 'Custom upload failure message');
    });

    test('throws ImageUploadException when file does not exist', () async {
      final service = CloudinaryService(
        cloudName: 'test-cloud',
        uploadPreset: 'test-preset',
      );

      expect(
        () => service.uploadImage('/non/existent/path/image_123.jpg'),
        throwsA(
          isA<ImageUploadException>().having(
            (e) => e.message,
            'message',
            contains('Selected image file was not found on device'),
          ),
        ),
      );
    });

    test('throws ImageUploadException when credentials are missing or empty', () async {
      final tempDir = Directory.systemTemp.createTempSync('cloudinary_test');
      final tempFile = File('${tempDir.path}/test_img.jpg')
        ..writeAsStringSync('dummy-image-content');

      addTearDown(() {
        tempDir.deleteSync(recursive: true);
      });

      final service = CloudinaryService(
        cloudName: '',
        uploadPreset: '',
      );

      expect(
        () => service.uploadImage(tempFile.path),
        throwsA(
          isA<ImageUploadException>().having(
            (e) => e.message,
            'message',
            contains('Cloudinary misconfigured'),
          ),
        ),
      );
    });

    test('uploadImageWithProgress rejects non-existent file with ImageUploadException', () async {
      final service = CloudinaryService(
        cloudName: 'test-cloud',
        uploadPreset: 'test-preset',
      );

      expect(
        () => service.uploadImageWithProgress(
          '/non/existent/file.jpg',
          (_) {},
        ),
        throwsA(isA<ImageUploadException>()),
      );
    });
  });
}
