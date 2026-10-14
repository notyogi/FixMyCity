import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:fixmycity_app/main.dart';
import 'package:fixmycity_app/screens/login_screen.dart';
import 'package:fixmycity_app/screens/home_screen.dart';

void main() {
  testWidgets('App launches to LoginScreen and navigates to HomeScreen on button tap', (
    WidgetTester tester,
  ) async {
    // Build FixMyCityApp wrapped in ProviderScope
    await tester.pumpWidget(
      const ProviderScope(
        child: FixMyCityApp(),
      ),
    );

    // Verify LoginScreen is shown
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text('FixMyCity'), findsOneWidget);
    expect(find.text('Login'), findsWidgets);

    // Tap 'Continue as Guest' button to navigate to HomeScreen
    final guestButton = find.text('Continue as Guest');
    await tester.ensureVisible(guestButton);
    await tester.tap(guestButton);
    await tester.pumpAndSettle();

    // Verify HomeScreen is now displayed
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Spotted an Issue?'), findsOneWidget);
    expect(find.text('Quick Actions'), findsOneWidget);
  });
}
