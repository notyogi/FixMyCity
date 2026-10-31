import 'package:flutter_test/flutter_test.dart';
import 'package:fixmycity_app/models/report_model.dart';

void main() {
  group('ReportModel backend deserialization & normalized status', () {
    test('deserializes raw backend report map correctly', () {
      final backendReportJson = {
        'id': '1f81ab67-38df-492b-8990-a408d4cc1bb2',
        'user_id': '43fbcf22-c3f2-45e0-8270-e41c463f2536',
        'image_url': 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        'lat': 12.9716,
        'lng': 77.5946,
        'issue_type': 'DRAINAGE',
        'severity': 'HIGH',
        'notes': 'drain is choked',
        'status': 'SUBMITTED',
        'cluster_id': '89b275bf-1941-4561-9e79-cb18ec10d866',
        'created_at': '2026-10-18T15:11:16.640Z',
        'user': {
          'id': '43fbcf22-c3f2-45e0-8270-e41c463f2536',
          'name': 'Citizen Tester',
        },
        'cluster': {
          'id': '89b275bf-1941-4561-9e79-cb18ec10d866',
          'confirmation_count': 3,
        },
      };

      final model = ReportModel.fromMap(backendReportJson);

      expect(model.id, '1f81ab67-38df-492b-8990-a408d4cc1bb2');
      expect(model.issueType, IssueType.DRAINAGE);
      expect(model.severity, Severity.HIGH);
      expect(model.notes, 'drain is choked');
      expect(model.normalizedStatus, 'Active');
      expect(model.latitude, 12.9716);
      expect(model.longitude, 77.5946);
      expect(model.userName, 'Citizen Tester');
      expect(model.clusterId, '89b275bf-1941-4561-9e79-cb18ec10d866');
      expect(model.confirmationCount, 3);
      expect(model.formattedTimeAgo, isNotEmpty);
      expect(model.nearSensitiveLocation, isFalse);
    });

    test('deserializes near_sensitive_location when true', () {
      final jsonWithRisk = {
        'id': 'risk-report-1',
        'image_url': 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
        'lat': 12.9716,
        'lng': 77.5946,
        'issue_type': 'POTHOLE',
        'severity': 'CRITICAL',
        'near_sensitive_location': true,
        'status': 'SUBMITTED',
        'created_at': '2026-10-31T15:00:00.000Z',
      };

      final model = ReportModel.fromMap(jsonWithRisk);
      expect(model.nearSensitiveLocation, isTrue);
    });

    test('normalizes statuses correctly', () {
      final submitted = ReportModel.fromMap({'id': '1', 'status': 'SUBMITTED', 'category': 'POTHOLE', 'lat': 0.0, 'lng': 0.0});
      expect(submitted.normalizedStatus, 'Active');

      final underReview = ReportModel.fromMap({'id': '2', 'status': 'UNDER_REVIEW', 'category': 'POTHOLE', 'lat': 0.0, 'lng': 0.0});
      expect(underReview.normalizedStatus, 'In Progress');

      final scheduled = ReportModel.fromMap({'id': '3', 'status': 'SCHEDULED', 'category': 'POTHOLE', 'lat': 0.0, 'lng': 0.0});
      expect(scheduled.normalizedStatus, 'In Progress');

      final fixed = ReportModel.fromMap({'id': '4', 'status': 'FIXED', 'category': 'POTHOLE', 'lat': 0.0, 'lng': 0.0});
      expect(fixed.normalizedStatus, 'Resolved');
    });
  });
}
