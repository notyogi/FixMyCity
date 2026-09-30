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
    expect(find.text('Sign In'), findsOneWidget);

    // Tap 'Sign In' button to navigate to HomeScreen
    await tester.tap(find.text('Sign In'));
    await tester.pumpAndSettle();

    // Verify HomeScreen is now displayed
    expect(find.byType(HomeScreen), findsOneWidget);
    expect(find.text('Spotted an Issue?'), findsOneWidget);
    expect(find.text('Quick Actions'), findsOneWidget);
  });
}
