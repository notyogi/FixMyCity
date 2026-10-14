import 'dart:async';
import 'package:geolocator/geolocator.dart';

/// Result object for location retrieval operations.
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

/// Service for handling GPS geolocation and device location permissions.
class LocationService {
  /// Request location permissions and obtain current coordinates.
  Future<LocationResult> fetchCurrentLocation() async {
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        return const LocationResult(
          errorMessage: 'Location services are disabled. Please enable GPS in device settings.',
          isServiceDisabled: true,
        );
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          return const LocationResult(
            errorMessage: 'Location permission was denied. Location is required to submit damage reports.',
            isPermissionDenied: true,
          );
        }
      }

      if (permission == LocationPermission.deniedForever) {
        return const LocationResult(
          errorMessage: 'Location permission is permanently denied. Please allow location access in your app settings.',
          isPermissionDenied: true,
        );
      }

      // Try fast lookup using last known position first
      Position? position = await Geolocator.getLastKnownPosition();

      // If no last known position, request fresh position with timeout fallback
      if (position == null) {
        try {
          position = await Geolocator.getCurrentPosition(
            locationSettings: const LocationSettings(
              accuracy: LocationAccuracy.medium,
              timeLimit: Duration(seconds: 8),
            ),
          );
        } on TimeoutException {
          // If fresh location times out (common when simulator location is None), try last known again
          position = await Geolocator.getLastKnownPosition();
          if (position == null) {
            return const LocationResult(
              errorMessage:
                  'GPS timed out. On iOS Simulator, go to Mac Menu Bar -> Features -> Location, and select "Apple Store" or "Custom Location".',
            );
          }
        }
      }

      return LocationResult(position: position);
    } catch (e) {
      // Check for last known position as safety fallback
      try {
        final lastKnown = await Geolocator.getLastKnownPosition();
        if (lastKnown != null) {
          return LocationResult(position: lastKnown);
        }
      } catch (_) {}

      return LocationResult(
        errorMessage: 'Failed to acquire location: $e',
      );
    }
  }

  /// Legacy helper for backward compatibility
  Future<Position?> getCurrentLocation() async {
    final result = await fetchCurrentLocation();
    return result.position;
  }

  /// Check whether location services are enabled on the device.
  Future<bool> isLocationEnabled() async {
    return await Geolocator.isLocationServiceEnabled();
  }
}
