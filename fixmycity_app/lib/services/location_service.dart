/*
 * ============================================================================
 * ERROR UI HANDLING EXAMPLE FOR CALLING WIDGETS
 * ============================================================================
 *
 * The following pattern demonstrates how a calling widget should catch and
 * handle the three failure cases with distinct user-facing messages and recovery actions:
 *
 * ```dart
 * final locationService = LocationService();
 *
 * Future<void> onCaptureLocation(BuildContext context) async {
 *   try {
 *     // Attempt to obtain current high-accuracy coordinates
 *     final Position position = await locationService.getCurrentLocation();
 *     print('Acquired location: ${position.latitude}, ${position.longitude}');
 *   } on LocationPermissionException catch (e) {
 *     // Case 1: Device location services (GPS) disabled at OS level
 *     if (e.isServiceDisabled) {
 *       showDialog(
 *         context: context,
 *         builder: (ctx) => AlertDialog(
 *           title: const Text('Location Services Disabled'),
 *           content: Text(e.message),
 *           actions: [
 *             TextButton(
 *               onPressed: () => Navigator.pop(ctx),
 *               child: const Text('Cancel'),
 *             ),
 *             ElevatedButton(
 *               onPressed: () {
 *                 Navigator.pop(ctx);
 *                 locationService.openLocationSettings();
 *               },
 *               child: const Text('Enable Location'),
 *             ),
 *           ],
 *         ),
 *       );
 *       return;
 *     }
 *
 *     // Case 2: Permission permanently denied (deniedForever)
 *     if (e.isPermanentlyDenied) {
 *       showDialog(
 *         context: context,
 *         builder: (ctx) => AlertDialog(
 *           title: const Text('Permission Required'),
 *           content: Text(e.message),
 *           actions: [
 *             TextButton(
 *               onPressed: () => Navigator.pop(ctx),
 *               child: const Text('Cancel'),
 *             ),
 *             ElevatedButton(
 *               onPressed: () {
 *                 Navigator.pop(ctx);
 *                 locationService.openAppSettings();
 *               },
 *               child: const Text('Open Settings'),
 *             ),
 *           ],
 *         ),
 *       );
 *       return;
 *     }
 *
 *     // Case 3: Normal permission denied (user tapped Don't Allow once)
 *     ScaffoldMessenger.of(context).showSnackBar(
 *       SnackBar(
 *         content: Text(e.message),
 *         action: SnackBarAction(
 *           label: 'Grant',
 *           onPressed: () => onCaptureLocation(context),
 *         ),
 *       ),
 *     );
 *   } on LocationFetchException catch (e) {
 *     // Case 4: Weak GPS signal or timeout fetching coordinates
 *     ScaffoldMessenger.of(context).showSnackBar(
 *       SnackBar(
 *         content: Text(e.message),
 *         action: SnackBarAction(
 *           label: 'Retry',
 *           onPressed: () => onCaptureLocation(context),
 *         ),
 *       ),
 *     );
 *   }
 * }
 * ```
 * ============================================================================
 */

import 'dart:async';
import 'package:geolocator/geolocator.dart';

/// Thrown when location permission is denied or location services are disabled.
class LocationPermissionException implements Exception {
  final String message;
  final bool isPermanentlyDenied;
  final bool isServiceDisabled;

  const LocationPermissionException(
    this.message, {
    this.isPermanentlyDenied = false,
    this.isServiceDisabled = false,
  });

  @override
  String toString() => message;
}

/// Thrown when GPS location acquisition times out or encounters hardware/signal issues.
class LocationFetchException implements Exception {
  final String message;

  const LocationFetchException([
    this.message = 'Could not get your location. Please check your GPS signal and try again.',
  ]);

  @override
  String toString() => message;
}

/// Result object for location retrieval operations (backwards compatibility).
class LocationResult {
  final Position? position;
  final String? errorMessage;
  final bool isPermissionDenied;
  final bool isServiceDisabled;

  const LocationResult({
    this.position,
    this.errorMessage,
    this.isPermissionDenied = false,
    this.isServiceDisabled = false,
  });

  bool get isSuccess => position != null;
}

/// Standalone, reusable service for GPS location fetching and device permission management.
class LocationService {
  /// Checks whether location services are enabled on the device at all and requests
  /// permission if not yet granted.
  ///
  /// - Returns `false` if location services are disabled at the OS level.
  /// - Requests permission if currently `LocationPermission.denied`.
  /// - Returns `false` if denied again or if permanently denied (`LocationPermission.deniedForever`).
  /// - Returns `true` if granted (`LocationPermission.whileInUse` or `LocationPermission.always`).
  Future<bool> checkAndRequestPermission() async {
    // 1. Check if location services are enabled on the device at all
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return false;
    }

    // 2. Check current permission status
    var permission = await Geolocator.checkPermission();

    // 3. If denied, request permission
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }

    // 4. Branch on actual enum values explicitly
    switch (permission) {
      case LocationPermission.whileInUse:
      case LocationPermission.always:
        return true;
      case LocationPermission.denied:
      case LocationPermission.deniedForever:
      case LocationPermission.unableToDetermine:
        return false;
    }
  }

  /// Acquires the device's current high-accuracy GPS position.
  ///
  /// - Calls [checkAndRequestPermission] first; throws [LocationPermissionException] if false.
  /// - Calls [Geolocator.getCurrentPosition] with [LocationAccuracy.high] and a 10s timeout.
  /// - Rethrows [LocationFetchException] on timeout or signal failure.
  Future<Position> getCurrentLocation() async {
    // Verify OS-level location service is enabled
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw const LocationPermissionException(
        'Location services are disabled on your device. Please enable GPS in device settings.',
        isServiceDisabled: true,
      );
    }

    // Check and request permission
    final hasPermission = await checkAndRequestPermission();
    if (!hasPermission) {
      final permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.deniedForever) {
        throw const LocationPermissionException(
          'Location permission is permanently denied. Please allow location access in your app settings.',
          isPermanentlyDenied: true,
        );
      }
      throw const LocationPermissionException(
        'Location permission was denied. Location is required to tag and submit civic damage reports.',
      );
    }

    // Acquire current GPS position with high accuracy and 10s timeout
    try {
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
      return position;
    } on TimeoutException {
      throw const LocationFetchException(
        'Could not get your location. Please check your GPS signal and try again.',
      );
    } catch (_) {
      throw const LocationFetchException(
        'Could not get your location. Please check your GPS signal and try again.',
      );
    }
  }

  /// Convenience method to open the device-level location settings screen.
  Future<void> openLocationSettings() async {
    await Geolocator.openLocationSettings();
  }

  /// Convenience method to open the application-level settings screen.
  Future<void> openAppSettings() async {
    await Geolocator.openAppSettings();
  }

  /// High-level wrapper returning a structured [LocationResult] with fallback handling.
  Future<LocationResult> fetchCurrentLocation() async {
    try {
      final position = await getCurrentLocation();
      return LocationResult(position: position);
    } on LocationPermissionException catch (e) {
      return LocationResult(
        errorMessage: e.message,
        isPermissionDenied: !e.isServiceDisabled,
        isServiceDisabled: e.isServiceDisabled,
      );
    } on LocationFetchException catch (e) {
      // Simulator / weak GPS fallback: attempt last known position
      try {
        final lastKnown = await Geolocator.getLastKnownPosition();
        if (lastKnown != null) {
          return LocationResult(position: lastKnown);
        }
      } catch (_) {}

      return LocationResult(errorMessage: e.message);
    } catch (e) {
      return LocationResult(errorMessage: 'Failed to acquire location: $e');
    }
  }

  /// Check whether location services are enabled on the device.
  Future<bool> isLocationEnabled() async {
    return await Geolocator.isLocationServiceEnabled();
  }
}
