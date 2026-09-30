import 'package:supabase_flutter/supabase_flutter.dart';
import '../models/user_model.dart';

/// Service stub for handling user authentication via Supabase.
class AuthService {
  final SupabaseClient? _supabaseClient;

  AuthService({SupabaseClient? client})
      : _supabaseClient = client;

  /// Stream of authentication state changes.
  Stream<AuthState>? get authStateChanges => _supabaseClient?.auth.onAuthStateChange;

  /// Current authenticated user session or model.
  User? get currentSupabaseUser => _supabaseClient?.auth.currentUser;

  /// Sign up a new user with email and password.
  Future<UserModel?> signUp({
    required String email,
    required String password,
    String? fullName,
  }) async {
    // Stub implementation: Will invoke Supabase auth signUp in future step
    throw UnimplementedError('signUp() has not been implemented yet.');
  }

  /// Sign in existing user with email and password.
  Future<UserModel?> signIn({
    required String email,
    required String password,
  }) async {
    // Stub implementation: Will invoke Supabase auth signInWithPassword in future step
    throw UnimplementedError('signIn() has not been implemented yet.');
  }

  /// Sign out the current user session.
  Future<void> signOut() async {
    // Stub implementation: Will invoke Supabase auth signOut in future step
    throw UnimplementedError('signOut() has not been implemented yet.');
  }

  /// Send password reset link to user's email.
  Future<void> resetPassword({required String email}) async {
    // Stub implementation
    throw UnimplementedError('resetPassword() has not been implemented yet.');
  }
}
