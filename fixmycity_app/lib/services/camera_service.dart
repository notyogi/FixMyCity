import 'package:camera/camera.dart';

/// Exception thrown when camera initialization or device discovery fails.
class CameraInitException implements Exception {
  final String message;

  const CameraInitException(this.message);

  @override
  String toString() => 'CameraInitException: $message';
}

/// Service for discovering, initializing, and disposing device camera controllers.
class CameraService {
  /// Discovers available cameras and initializes the default back-facing camera
  /// with [ResolutionPreset.high] (balanced for civic damage reporting photos).
  ///
  /// Throws [CameraInitException] if no camera is available or initialization fails.
  Future<CameraController> initializeCamera() async {
    try {
      final cameras = await availableCameras();
      if (cameras.isEmpty) {
        throw const CameraInitException(
          'No camera hardware detected on this device.',
        );
      }

      // Default to back-facing camera; fall back to the first available camera
      final CameraDescription selectedCamera = cameras.firstWhere(
        (cam) => cam.lensDirection == CameraLensDirection.back,
        orElse: () => cameras.first,
      );

      final controller = CameraController(
        selectedCamera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await controller.initialize();
      return controller;
    } on CameraInitException {
      rethrow;
    } on CameraException catch (e) {
      throw CameraInitException(
        'Camera error (${e.code}): ${e.description ?? "Failed to initialize camera."}',
      );
    } catch (e) {
      throw CameraInitException('Unexpected camera initialization error: $e');
    }
  }

  /// Properly disposes the camera controller to release hardware resources.
  Future<void> disposeCamera(CameraController? controller) async {
    if (controller != null) {
      try {
        await controller.dispose();
      } catch (_) {}
    }
  }
}
