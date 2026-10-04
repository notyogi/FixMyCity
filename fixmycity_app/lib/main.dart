import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/home_screen.dart';
import 'screens/login_screen.dart';

/// Global key to enable top-level navigation from auth state listeners
final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Load environment variables securely from .env
  try {
    await dotenv.load(fileName: '.env');
  } catch (e) {
    debugPrint('Warning: Could not load .env file: $e');
  }

  // Read Supabase credentials dynamically from environment variables
  final supabaseUrl = dotenv.env['SUPABASE_URL'] ?? '';
  final supabaseAnonKey = dotenv.env['SUPABASE_ANON_KEY'] ?? '';

  if (supabaseUrl.isNotEmpty && supabaseAnonKey.isNotEmpty) {
    try {
      await Supabase.initialize(
        url: supabaseUrl,
        // ignore: deprecated_member_use
        anonKey: supabaseAnonKey,
      );
      debugPrint('Supabase initialized successfully.');
    } catch (e) {
      debugPrint('Warning: Supabase initialization error: $e');
    }
  } else {
    debugPrint('Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set in .env.');
  }

  runApp(
    const ProviderScope(
      child: FixMyCityApp(),
    ),
  );
}

class FixMyCityApp extends StatefulWidget {
  const FixMyCityApp({super.key});

  @override
  State<FixMyCityApp> createState() => _FixMyCityAppState();
}

class _FixMyCityAppState extends State<FixMyCityApp> {
  StreamSubscription<AuthState>? _authSubscription;

  @override
  void initState() {
    super.initState();
    _setupAuthStateListener();
  }

  void _setupAuthStateListener() {
    try {
      _authSubscription = Supabase.instance.client.auth.onAuthStateChange.listen(
        (data) {
          final AuthChangeEvent event = data.event;
          final Session? session = data.session;

          debugPrint('Auth event received: $event (session: ${session != null})');

          if (event == AuthChangeEvent.signedIn && session != null) {
            // Automatically route from login screen to home screen on successful OAuth redirect
            navigatorKey.currentState?.pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const HomeScreen()),
              (route) => false,
            );
          } else if (event == AuthChangeEvent.signedOut) {
            // Return to login screen on sign out
            navigatorKey.currentState?.pushAndRemoveUntil(
              MaterialPageRoute(builder: (_) => const LoginScreen()),
              (route) => false,
            );
          }
        },
        onError: (error) {
          debugPrint('Supabase auth state stream error: $error');
        },
      );
    } catch (e) {
      debugPrint('Supabase auth listener registration bypassed (client may not be initialized): $e');
    }
  }

  @override
  void dispose() {
    _authSubscription?.cancel();
    super.dispose();
  }

  Widget _resolveInitialScreen() {
    try {
      if (Supabase.instance.client.auth.currentSession != null) {
        return const HomeScreen();
      }
    } catch (_) {}
    return const LoginScreen();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: navigatorKey,
      title: 'FixMyCity',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E), // Teal civic aesthetic
          brightness: Brightness.light,
        ),
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F766E),
          brightness: Brightness.dark,
        ),
        appBarTheme: const AppBarTheme(
          centerTitle: false,
          elevation: 0,
        ),
      ),
      themeMode: ThemeMode.system,
      home: _resolveInitialScreen(),
    );
  }
}
