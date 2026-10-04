import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_model.dart';

/// Service for handling user authentication via Supabase.
class AuthService {
  final SupabaseClient? _customClient;

  AuthService({SupabaseClient? client}) : _customClient = client;

  /// Safe accessor for the SupabaseClient instance.
  SupabaseClient? get _client {
    if (_customClient != null) return _customClient;
    try {
      return Supabase.instance.client;
    } catch (e) {
      debugPrint('AuthService: Supabase instance not initialized: $e');
      return null;
    }
  }

  /// Stream of authentication state changes.
  Stream<AuthState>? get authStateChanges => _client?.auth.onAuthStateChange;

  /// Current authenticated user session.
  User? get currentSupabaseUser => _client?.auth.currentUser;

  /// Returns the current Supabase session's user, or null if not signed in.
  User? getCurrentUser() {
    try {
      final user = _client?.auth.currentUser;
      return user;
    } catch (e, stackTrace) {
      debugPrint('AuthService.getCurrentUser failed: $e\n$stackTrace');
      return null;
    }
  }

  /// Initiates Google OAuth sign-in using the system browser.
  /// Redirects back into the app using the custom URI scheme "fixmycity://login-callback".
  Future<bool> signInWithGoogle() async {
    try {
      final client = _client;
      if (client == null) {
        throw StateError('Supabase client is not initialized.');
      }

      debugPrint('AuthService: Launching Google OAuth sign-in flow...');
      return await client.auth.signInWithOAuth(
        OAuthProvider.google,
        redirectTo: 'fixmycity://login-callback',
        authScreenLaunchMode: LaunchMode.externalApplication,
      );
    } catch (e, stackTrace) {
      debugPrint('AuthService.signInWithGoogle failed: $e\n$stackTrace');
      rethrow;
    }
  }

  /// Signs in existing user with email and password using Supabase.
  Future<AuthResponse?> signInWithEmail(String email, String password) async {
    try {
      final client = _client;
      if (client == null) {
        throw StateError('Supabase client is not initialized.');
      }

      debugPrint('AuthService: Signing in with email: $email');
      final response = await client.auth.signInWithPassword(
        email: email,
        password: password,
      );
      return response;
    } catch (e, stackTrace) {
      debugPrint('AuthService.signInWithEmail failed for $email: $e\n$stackTrace');
      rethrow;
    }
  }

  /// Signs up a new user with email and password using Supabase.
  Future<AuthResponse?> signUpWithEmail(String email, String password) async {
    try {
      final client = _client;
      if (client == null) {
        throw StateError('Supabase client is not initialized.');
      }

      debugPrint('AuthService: Signing up with email: $email');
      final response = await client.auth.signUp(
        email: email,
        password: password,
      );
      return response;
    } catch (e, stackTrace) {
      debugPrint('AuthService.signUpWithEmail failed for $email: $e\n$stackTrace');
      rethrow;
    }
  }

  /// Signs out the current user session.
  Future<void> signOut() async {
    try {
      final client = _client;
      if (client == null) {
        throw StateError('Supabase client is not initialized.');
      }

      debugPrint('AuthService: Signing out current session');
      await client.auth.signOut();
    } catch (e, stackTrace) {
      debugPrint('AuthService.signOut failed: $e\n$stackTrace');
      rethrow;
    }
  }

  /// Send password reset link to user's email.
  Future<void> resetPassword({required String email}) async {
    try {
      final client = _client;
      if (client == null) {
        throw StateError('Supabase client is not initialized.');
      }

      await client.auth.resetPasswordForEmail(email);
    } catch (e, stackTrace) {
      debugPrint('AuthService.resetPassword failed for $email: $e\n$stackTrace');
      rethrow;
    }
  }

  /// Optional wrapper for signIn returning UserModel.
  Future<UserModel?> signIn({
    required String email,
    required String password,
  }) async {
    final response = await signInWithEmail(email, password);
    final user = response?.user;
    if (user != null) {
      return UserModel(
        id: user.id,
        email: user.email ?? email,
        fullName: user.userMetadata?['full_name'] as String?,
        avatarUrl: user.userMetadata?['avatar_url'] as String?,
      );
    }
    return null;
  }

  /// Optional wrapper for signUp returning UserModel.
  Future<UserModel?> signUp({
    required String email,
    required String password,
    String? fullName,
  }) async {
    final response = await signUpWithEmail(email, password);
    final user = response?.user;
    if (user != null) {
      return UserModel(
        id: user.id,
        email: user.email ?? email,
        fullName: fullName ?? user.userMetadata?['full_name'] as String?,
        avatarUrl: user.userMetadata?['avatar_url'] as String?,
      );
    }
    return null;
  }
}
