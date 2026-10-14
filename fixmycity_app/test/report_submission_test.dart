import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:fixmycity_app/models/report_model.dart';
import 'package:fixmycity_app/providers/new_report_provider.dart';

void main() {
  group('NewReportProvider tests', () {
    test('initial state has empty fields', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final state = container.read(newReportProvider);
      expect(state.imageFilePath, isNull);
      expect(state.latitude, isNull);
      expect(state.longitude, isNull);
      expect(state.issueType, isNull);
      expect(state.severity, isNull);
      expect(state.notes, isNull);
      expect(state.isReadyToSubmit, isFalse);
    });

    test('updating photo, location, and tags updates state and isReadyToSubmit', () {
      final container = ProviderContainer();
      addTearDown(container.dispose);

      final notifier = container.read(newReportProvider.notifier);
      notifier.setImagePath('/path/to/damage.jpg');
      notifier.setLocation(28.6139, 77.2090);
      notifier.setTags(
        issueType: IssueType.POTHOLE,
        severity: Severity.CRITICAL,
        notes: 'Deep pothole blocking main lane',
      );

      final state = container.read(newReportProvider);
      expect(state.imageFilePath, '/path/to/damage.jpg');
      expect(state.latitude, 28.6139);
      expect(state.longitude, 77.2090);
      expect(state.issueType, IssueType.POTHOLE);
      expect(state.severity, Severity.CRITICAL);
      expect(state.notes, 'Deep pothole blocking main lane');
      expect(state.isReadyToSubmit, isTrue);

      // Verify reset clears all fields
      notifier.reset();
      final resetState = container.read(newReportProvider);
      expect(resetState.imageFilePath, isNull);
      expect(resetState.isReadyToSubmit, isFalse);
    });
  });

  group('ReportModel enums', () {
    test('IssueType display names and parsing', () {
      expect(IssueType.POTHOLE.displayName, 'Pothole');
      expect(IssueType.STREETLIGHT.displayName, 'Streetlight');
      expect(IssueType.fromString('POTHOLE'), IssueType.POTHOLE);
      expect(IssueType.fromString('unknown'), IssueType.OTHER);
    });

    test('Severity display names and descriptions', () {
      expect(Severity.LOW.displayName, 'Low');
      expect(Severity.CRITICAL.displayName, 'Critical');
      expect(Severity.CRITICAL.description, contains('Immediate safety hazard'));
      expect(Severity.fromString('HIGH'), Severity.HIGH);
    });
  });
}
