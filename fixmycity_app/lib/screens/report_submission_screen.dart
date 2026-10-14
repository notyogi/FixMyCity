import 'dart:io';
import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import '../models/report_model.dart';
import '../providers/new_report_provider.dart';
import '../services/location_service.dart';

class ReportSubmissionScreen extends ConsumerStatefulWidget {
  const ReportSubmissionScreen({super.key});

  @override
  ConsumerState<ReportSubmissionScreen> createState() =>
      _ReportSubmissionScreenState();
}

class _ReportSubmissionScreenState extends ConsumerState<ReportSubmissionScreen> {
  final PageController _pageController = PageController();
  int _currentStep = 0;

  // Step 1: Camera & Image state
  List<CameraDescription> _cameras = [];
  CameraController? _cameraController;
  bool _isCameraInitialized = false;
  bool _cameraError = false;
  String? _cameraErrorMessage;
  String? _capturedPhotoPath;
  bool _isFetchingLocation = false;

  // Step 2: Tagging state
  IssueType? _selectedIssueType;
  Severity? _selectedSeverity;
  final TextEditingController _notesController = TextEditingController();

  // Step 3: Submission state
  bool _isSubmitting = false;

  @override
  void initState() {
    super.initState();
    _initCamera();
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _pageController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _initCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras.isNotEmpty) {
        _cameraController = CameraController(
          _cameras.first,
          ResolutionPreset.high,
          enableAudio: false,
        );
        await _cameraController!.initialize();
        if (mounted) {
          setState(() {
            _isCameraInitialized = true;
            _cameraError = false;
          });
        }
      } else {
        if (mounted) {
          setState(() {
            _cameraError = true;
            _cameraErrorMessage = 'No camera hardware found on this device.';
          });
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _cameraError = true;
          _cameraErrorMessage = 'Camera unavailable: $e';
        });
      }
    }
  }

  void _goToStep(int step) {
    setState(() => _currentStep = step);
    _pageController.animateToPage(
      step,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  void _handleBackNavigation() {
    if (_currentStep > 0) {
      _goToStep(_currentStep - 1);
    } else {
      _confirmExit();
    }
  }

  Future<void> _confirmExit() async {
    if (_capturedPhotoPath == null) {
      ref.read(newReportProvider.notifier).reset();
      Navigator.of(context).pop();
      return;
    }

    final shouldExit = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard Report?'),
        content: const Text(
          'Are you sure you want to exit? Your captured photo and details will be lost.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Keep Editing'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
            ),
            child: const Text('Discard'),
          ),
        ],
      ),
    );

    if (shouldExit == true && mounted) {
      ref.read(newReportProvider.notifier).reset();
      Navigator.of(context).pop();
    }
  }

  Future<void> _takePicture() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }
    if (_cameraController!.value.isTakingPicture) {
      return;
    }

    try {
      final XFile photo = await _cameraController!.takePicture();
      setState(() {
        _capturedPhotoPath = photo.path;
      });
    } catch (e) {
      _showSnackBar('Failed to capture photo: $e', isError: true);
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final picker = ImagePicker();
      final XFile? photo = await picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
      );
      if (photo != null && mounted) {
        setState(() {
          _capturedPhotoPath = photo.path;
        });
      }
    } catch (e) {
      _showSnackBar('Failed to pick photo from gallery: $e', isError: true);
    }
  }

  Future<void> _confirmPhotoAndFetchLocation() async {
    if (_capturedPhotoPath == null) return;

    setState(() => _isFetchingLocation = true);

    final locationResult = await LocationService().fetchCurrentLocation();

    if (!mounted) return;
    setState(() => _isFetchingLocation = false);

    if (!locationResult.isSuccess || locationResult.position == null) {
      _showLocationErrorDialog(
        locationResult.errorMessage ??
            'Could not acquire current GPS location. Location is required to submit a report.',
      );
      return;
    }

    final position = locationResult.position!;

    // Persist captured media and location in Riverpod state
    ref.read(newReportProvider.notifier).setImagePath(_capturedPhotoPath!);
    ref.read(newReportProvider.notifier).setLocation(position.latitude, position.longitude);

    _showSnackBar(
      'Location captured ✓ (${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)})',
      isSuccess: true,
    );

    _goToStep(1);
  }

  void _showLocationErrorDialog(String message) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        icon: const Icon(Icons.location_off_rounded, color: Colors.orange, size: 40),
        title: const Text('Location Required'),
        content: Text(
          message,
          style: const TextStyle(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton.icon(
            onPressed: () {
              Navigator.of(ctx).pop();
              _confirmPhotoAndFetchLocation();
            },
            icon: const Icon(Icons.refresh_rounded, size: 18),
            label: const Text('Retry Location'),
          ),
        ],
      ),
    );
  }

  void _showSnackBar(String message, {bool isError = false, bool isSuccess = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError
            ? Theme.of(context).colorScheme.error
            : isSuccess
                ? Colors.teal.shade700
                : null,
        behavior: SnackBarBehavior.floating,
        duration: const Duration(seconds: 3),
      ),
    );
  }

  Future<void> _handleFinalSubmission() async {
    setState(() => _isSubmitting = true);

    try {
      // Stub submission call from Riverpod notifier
      await ref.read(newReportProvider.notifier).submitReport();

      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Row(
            children: [
              Icon(Icons.check_circle_rounded, color: Colors.white),
              SizedBox(width: 10),
              Text(
                'Report submitted! (stub)',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
            ],
          ),
          backgroundColor: Colors.teal.shade700,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 3),
        ),
      );

      // Reset state and return to Home Screen
      ref.read(newReportProvider.notifier).reset();
      Navigator.of(context).pop();
    } catch (e) {
      if (mounted) {
        _showSnackBar('Submission error: $e', isError: true);
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  // --- Step 1 UI: Camera Capture ---
  Widget _buildStep1Capture(ThemeData theme) {
    if (_capturedPhotoPath != null) {
      return _buildCapturedPhotoPreview(theme);
    }

    if (_isCameraInitialized && _cameraController != null) {
      return Stack(
        fit: StackFit.expand,
        children: [
          // Live Camera View
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: CameraPreview(_cameraController!),
          ),

          // Camera viewfinder guidance overlay
          Positioned(
            top: 24,
            left: 20,
            right: 20,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.camera_alt_outlined, color: Colors.white, size: 16),
                  SizedBox(width: 8),
                  Text(
                    'Frame the damaged infrastructure',
                    style: TextStyle(color: Colors.white, fontSize: 13),
                  ),
                ],
              ),
            ),
          ),

          // Camera Controls at bottom
          Positioned(
            bottom: 24,
            left: 0,
            right: 0,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                // Pick from gallery alternative button
                IconButton.filledTonal(
                  onPressed: _pickFromGallery,
                  tooltip: 'Choose from Gallery',
                  icon: const Icon(Icons.photo_library_outlined, size: 26),
                  style: IconButton.styleFrom(
                    padding: const EdgeInsets.all(14),
                  ),
                ),

                // Primary Shutter Button
                GestureDetector(
                  onTap: _takePicture,
                  child: Container(
                    width: 76,
                    height: 76,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white, width: 4),
                      color: Colors.white.withValues(alpha: 0.25),
                    ),
                    child: Center(
                      child: Container(
                        width: 58,
                        height: 58,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: theme.colorScheme.primary,
                        ),
                        child: const Icon(Icons.camera_alt_rounded, color: Colors.white, size: 28),
                      ),
                    ),
                  ),
                ),

                // Switch camera lens if multiple cameras available
                if (_cameras.length > 1)
                  IconButton.filledTonal(
                    onPressed: () {
                      final currentIdx = _cameras.indexOf(_cameraController!.description);
                      final nextIdx = (currentIdx + 1) % _cameras.length;
                      _cameraController?.dispose();
                      _cameraController = CameraController(
                        _cameras[nextIdx],
                        ResolutionPreset.high,
                        enableAudio: false,
                      );
                      _cameraController!.initialize().then((_) {
                        if (mounted) setState(() {});
                      });
                    },
                    tooltip: 'Switch Camera',
                    icon: const Icon(Icons.flip_camera_ios_outlined, size: 24),
                    style: IconButton.styleFrom(
                      padding: const EdgeInsets.all(14),
                    ),
                  )
                else
                  const SizedBox(width: 54),
              ],
            ),
          ),
        ],
      );
    }

    // Fallback UI if camera cannot be initialized (e.g. simulator)
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer.withValues(alpha: 0.4),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.camera_enhance_outlined,
                size: 54,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              _cameraErrorMessage ?? 'Live Camera Initializing...',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Text(
              'You can capture live footage or choose an existing photo from your device gallery.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 28),
            FilledButton.icon(
              onPressed: _pickFromGallery,
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Pick from Gallery'),
              style: FilledButton.styleFrom(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
            ),
            if (_cameraError) ...[
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: _initCamera,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry Camera'),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // Preview captured photo with Retake and Use Photo options
  Widget _buildCapturedPhotoPreview(ThemeData theme) {
    return Column(
      children: [
        Expanded(
          child: Container(
            width: double.infinity,
            margin: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Image.file(
              File(_capturedPhotoPath!),
              fit: BoxFit.cover,
            ),
          ),
        ),

        // Decision actions
        Container(
          padding: const EdgeInsets.fromLTRB(20, 10, 20, 24),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _isFetchingLocation
                      ? null
                      : () {
                          setState(() {
                            _capturedPhotoPath = null;
                          });
                        },
                  icon: const Icon(Icons.replay_rounded),
                  label: const Text('Retake'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  onPressed: _isFetchingLocation ? null : _confirmPhotoAndFetchLocation,
                  icon: _isFetchingLocation
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Icon(Icons.check_rounded),
                  label: Text(_isFetchingLocation ? 'Acquiring GPS...' : 'Use Photo'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // --- Step 2 UI: Issue Tagging ---
  Widget _buildStep2Tagging(ThemeData theme) {
    final canProceed = _selectedIssueType != null && _selectedSeverity != null;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Photo Thumbnail Preview at top
          if (_capturedPhotoPath != null)
            Container(
              height: 130,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: theme.dividerColor.withValues(alpha: 0.6)),
              ),
              clipBehavior: Clip.antiAlias,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Image.file(
                    File(_capturedPhotoPath!),
                    fit: BoxFit.cover,
                  ),
                  Positioned(
                    bottom: 8,
                    right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withValues(alpha: 0.7),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.location_on, color: Colors.tealAccent, size: 14),
                          SizedBox(width: 4),
                          Text(
                            'GPS Tagged',
                            style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 20),

          // Issue Type Dropdown
          Text(
            'Issue Type',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<IssueType>(
            initialValue: _selectedIssueType,
            decoration: InputDecoration(
              hintText: 'Select issue category',
              prefixIcon: const Icon(Icons.category_outlined),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              filled: true,
            ),
            items: IssueType.values.map((type) {
              return DropdownMenuItem<IssueType>(
                value: type,
                child: Text(type.displayName),
              );
            }).toList(),
            onChanged: (val) {
              setState(() => _selectedIssueType = val);
            },
          ),
          const SizedBox(height: 20),

          // Severity Dropdown
          Text(
            'Severity',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          DropdownButtonFormField<Severity>(
            initialValue: _selectedSeverity,
            decoration: InputDecoration(
              hintText: 'Select severity level',
              prefixIcon: const Icon(Icons.report_gmailerrorred_rounded),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              filled: true,
            ),
            items: Severity.values.map((sev) {
              return DropdownMenuItem<Severity>(
                value: sev,
                child: Row(
                  children: [
                    _buildSeverityIndicator(sev),
                    const SizedBox(width: 10),
                    Text(sev.displayName),
                  ],
                ),
              );
            }).toList(),
            onChanged: (val) {
              setState(() => _selectedSeverity = val);
            },
          ),

          // One-line Severity Hint text
          if (_selectedSeverity != null) ...[
            const SizedBox(height: 6),
            Padding(
              padding: const EdgeInsets.only(left: 4.0),
              child: Text(
                _selectedSeverity!.description,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontStyle: FontStyle.italic,
                ),
              ),
            ),
          ],
          const SizedBox(height: 20),

          // Optional Description / Notes Field
          Text(
            'Additional Notes (Optional)',
            style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          TextFormField(
            controller: _notesController,
            maxLines: 3,
            decoration: InputDecoration(
              hintText: 'Describe landmarks, severity, or immediate hazards...',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
              filled: true,
            ),
          ),
          const SizedBox(height: 32),

          // Next Button
          FilledButton.icon(
            onPressed: canProceed
                ? () {
                    ref.read(newReportProvider.notifier).setTags(
                          issueType: _selectedIssueType!,
                          severity: _selectedSeverity!,
                          notes: _notesController.text.trim().isNotEmpty
                              ? _notesController.text.trim()
                              : null,
                        );
                    _goToStep(2);
                  }
                : null,
            icon: const Icon(Icons.arrow_forward_rounded),
            label: const Text('Next: Review & Submit'),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 15),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
        ],
      ),
    );
  }

  // --- Step 3 UI: Summary & Submit ---
  Widget _buildStep3Submit(ThemeData theme) {
    final reportState = ref.watch(newReportProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Summary Header Card
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
              side: BorderSide(color: theme.dividerColor.withValues(alpha: 0.5)),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.assignment_turned_in_outlined, color: theme.colorScheme.primary),
                      const SizedBox(width: 8),
                      Text(
                        'Report Summary',
                        style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                      ),
                    ],
                  ),
                  const Divider(height: 24),

                  // Photo Thumbnail
                  if (reportState.imageFilePath != null)
                    Center(
                      child: Container(
                        height: 160,
                        width: double.infinity,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: theme.dividerColor),
                        ),
                        clipBehavior: Clip.antiAlias,
                        child: Image.file(
                          File(reportState.imageFilePath!),
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),

                  // Data attributes list
                  _buildSummaryRow(
                    context,
                    label: 'Issue Category',
                    value: reportState.issueType?.displayName ?? 'Not selected',
                    icon: Icons.category_outlined,
                  ),
                  const SizedBox(height: 12),

                  _buildSummaryRow(
                    context,
                    label: 'Severity Level',
                    value: reportState.severity?.displayName ?? 'Not selected',
                    icon: Icons.priority_high_rounded,
                    customValueWidget: reportState.severity != null
                        ? _buildSeverityBadge(reportState.severity!)
                        : null,
                  ),
                  const SizedBox(height: 12),

                  _buildSummaryRow(
                    context,
                    label: 'Location (GPS)',
                    value: (reportState.latitude != null && reportState.longitude != null)
                        ? '${reportState.latitude!.toStringAsFixed(5)}, ${reportState.longitude!.toStringAsFixed(5)}'
                        : 'No coordinates attached',
                    icon: Icons.my_location_rounded,
                  ),

                  if (reportState.notes != null && reportState.notes!.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    _buildSummaryRow(
                      context,
                      label: 'Additional Notes',
                      value: reportState.notes!,
                      icon: Icons.notes_rounded,
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Submit Action Button
          FilledButton.icon(
            onPressed: _isSubmitting ? null : _handleFinalSubmission,
            icon: _isSubmitting
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                  )
                : const Icon(Icons.send_rounded),
            label: Text(
              _isSubmitting ? 'Submitting Report...' : 'Submit Report',
              style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            style: FilledButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),

          OutlinedButton(
            onPressed: _isSubmitting ? null : () => _goToStep(1),
            style: OutlinedButton.styleFrom(
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Back to Edit Details'),
          ),
        ],
      ),
    );
  }

  Widget _buildSeverityIndicator(Severity sev) {
    Color color;
    switch (sev) {
      case Severity.LOW:
        color = Colors.green;
        break;
      case Severity.MEDIUM:
        color = Colors.amber.shade700;
        break;
      case Severity.HIGH:
        color = Colors.orange.shade800;
        break;
      case Severity.CRITICAL:
        color = Colors.red.shade700;
        break;
    }
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    );
  }

  Widget _buildSeverityBadge(Severity sev) {
    Color color;
    switch (sev) {
      case Severity.LOW:
        color = Colors.green;
        break;
      case Severity.MEDIUM:
        color = Colors.amber.shade800;
        break;
      case Severity.HIGH:
        color = Colors.orange.shade800;
        break;
      case Severity.CRITICAL:
        color = Colors.red.shade700;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        sev.displayName.toUpperCase(),
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold),
      ),
    );
  }

  Widget _buildSummaryRow(
    BuildContext context, {
    required String label,
    required String value,
    required IconData icon,
    Widget? customValueWidget,
  }) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 2),
              if (customValueWidget != null)
                customValueWidget
              else
                Text(
                  value,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
                ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    final stepTitles = ['Capture Photo', 'Tag Issue', 'Review & Submit'];

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) _handleBackNavigation();
      },
      child: Scaffold(
        appBar: AppBar(
          leading: IconButton(
            icon: Icon(_currentStep > 0 ? Icons.arrow_back_rounded : Icons.close_rounded),
            onPressed: _handleBackNavigation,
          ),
          title: Text(
            stepTitles[_currentStep],
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
          ),
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(24),
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Step ${_currentStep + 1} of 3',
                        style: TextStyle(
                          fontSize: 12,
                          color: theme.colorScheme.primary,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        stepTitles[_currentStep],
                        style: TextStyle(
                          fontSize: 12,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 6),
                LinearProgressIndicator(
                  value: (_currentStep + 1) / 3,
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                ),
              ],
            ),
          ),
        ),
        body: PageView(
          controller: _pageController,
          physics: const NeverScrollableScrollPhysics(),
          children: [
            _buildStep1Capture(theme),
            _buildStep2Tagging(theme),
            _buildStep3Submit(theme),
          ],
        ),
      ),
    );
  }
}
