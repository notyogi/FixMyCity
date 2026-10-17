import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import '../widgets/camera_capture_widget.dart';
import '../widgets/photo_preview_widget.dart';

/// Temporary throwaway test screen for verifying [CameraCaptureWidget]
/// and [PhotoPreviewWidget] in isolation.
class CameraTestScreen extends StatefulWidget {
  const CameraTestScreen({super.key});

  @override
  State<CameraTestScreen> createState() => _CameraTestScreenState();
}

class _CameraTestScreenState extends State<CameraTestScreen> {
  String? _capturedImagePath;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(
          _capturedImagePath == null ? 'Camera Test Screen' : 'Photo Preview Test',
          style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
      ),
      body: _capturedImagePath == null
          ? CameraCaptureWidget(
              onPhotoCaptured: (path) {
                if (kDebugMode) {
                  print('Photo captured: $path');
                }
                setState(() {
                  _capturedImagePath = path;
                });
              },
            )
          : PhotoPreviewWidget(
              imagePath: _capturedImagePath!,
              onRetake: () {
                if (kDebugMode) {
                  print('Retake tapped');
                }
                setState(() {
                  _capturedImagePath = null;
                });
              },
              onConfirm: () {
                if (kDebugMode) {
                  print('Confirmed: $_capturedImagePath');
                }
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Confirmed: $_capturedImagePath'),
                    backgroundColor: Colors.teal.shade700,
                  ),
                );
              },
            ),
    );
  }
}
