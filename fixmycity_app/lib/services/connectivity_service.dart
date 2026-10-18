import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';

/// Service for monitoring device network connectivity status using [Connectivity].
class ConnectivityService {
  final Connectivity _connectivity;

  ConnectivityService({Connectivity? connectivity})
      : _connectivity = connectivity ?? Connectivity();

  /// Checks if the device has an active network connection interface.
  ///
  /// Limitation note:
  /// [Connectivity.checkConnectivity] only verifies that a local network interface
  /// (e.g. Wi-Fi or mobile cellular) is connected. It does not ping an external
  /// host or guarantee actual internet reachability (e.g. captive portals, ISP
  /// outages, or restrictive firewalls). This limitation is fully acceptable for
  /// FixMyCity because any true downstream network failures or timeouts are
  /// caught and handled gracefully at the Cloudinary upload and HTTP API level.
  Future<bool> isOnline() async {
    try {
      final results = await _connectivity.checkConnectivity();
      return results.any((result) => result != ConnectivityResult.none);
    } catch (_) {
      // In case of platform-level errors, assume offline to fail-safe into offline queue
      return false;
    }
  }

  /// Broadcast stream that emits `true` when network connectivity is established,
  /// and `false` when all connectivity is lost.
  Stream<bool> get onConnectivityChanged {
    return _connectivity.onConnectivityChanged
        .map((results) => results.any((result) => result != ConnectivityResult.none))
        .distinct();
  }
}
