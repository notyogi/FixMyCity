import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';
import '../models/report_model.dart';
import 'login_screen.dart';
import 'report_submission_screen.dart';
import 'my_reports_screen.dart';
import 'report_detail_screen.dart';
import '../db/sqlite_helper.dart';
import '../services/sync_service.dart';
import 'camera_test_screen.dart';
import 'cloudinary_test_screen.dart';
import 'pending_reports_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  int _pendingCount = 0;
  final SyncService _syncService = SyncService();

  List<ReportModel> _reports = [];
  bool _isLoadingReports = true;
  String? _reportsError;
  String _selectedStatusFilter = 'All'; // 'All', 'Active', 'In Progress', 'Resolved'

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _refreshAllData();
    _syncService.isSyncingNotifier.addListener(_refreshPendingCount);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _refreshAllData();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _syncService.isSyncingNotifier.removeListener(_refreshPendingCount);
    super.dispose();
  }

  Future<void> _refreshAllData() async {
    await Future.wait([
      _refreshPendingCount(),
      _fetchReports(),
    ]);
  }

  Future<void> _refreshPendingCount() async {
    try {
      final count = await SQLiteHelper.instance.getPendingReportsCount();
      if (mounted) {
        setState(() => _pendingCount = count);
      }
    } catch (_) {}
  }

  Future<void> _fetchReports() async {
    if (!mounted) return;
    setState(() {
      _isLoadingReports = true;
      _reportsError = null;
    });

    try {
      final reports = await ApiService().fetchReports(limit: 100);
      if (mounted) {
        setState(() {
          _reports = reports;
          _isLoadingReports = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _reportsError = e.toString();
          _isLoadingReports = false;
        });
      }
    }
  }

  int get _activeCount =>
      _reports.where((r) => r.normalizedStatus == 'Active').length;

  int get _inProgressCount =>
      _reports.where((r) => r.normalizedStatus == 'In Progress').length;

  int get _resolvedCount =>
      _reports.where((r) => r.normalizedStatus == 'Resolved').length;

  List<ReportModel> get _filteredReports {
    if (_selectedStatusFilter == 'All') return _reports;
    return _reports
        .where((r) => r.normalizedStatus.toLowerCase() == _selectedStatusFilter.toLowerCase())
        .toList();
  }

  void _onStatusCardTapped(String statusKey) {
    setState(() {
      if (_selectedStatusFilter.toLowerCase() == statusKey.toLowerCase()) {
        _selectedStatusFilter = 'All';
      } else {
        _selectedStatusFilter = statusKey;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayedReports = _filteredReports;

    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Icon(
              Icons.location_city_rounded,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(width: 8),
            const Text(
              'FixMyCity',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: Badge(
              isLabelVisible: _pendingCount > 0,
              label: Text('$_pendingCount'),
              backgroundColor: Colors.amber.shade800,
              child: const Icon(Icons.cloud_queue_rounded),
            ),
            tooltip: 'Offline Queue ($_pendingCount pending)',
            onPressed: () async {
              await Navigator.of(context).push(
                MaterialPageRoute(builder: (_) => const PendingReportsScreen()),
              );
              _refreshAllData();
            },
          ),
          IconButton(
            icon: const Icon(Icons.logout_rounded),
            tooltip: 'Log Out',
            onPressed: () async {
              try {
                await AuthService().signOut();
              } catch (_) {}
              if (context.mounted) {
                Navigator.of(context).pushReplacement(
                  MaterialPageRoute(builder: (_) => const LoginScreen()),
                );
              }
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refreshAllData,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(20.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Welcome Card Banner
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(20.0),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      theme.colorScheme.primary,
                      theme.colorScheme.primaryContainer,
                    ],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: theme.colorScheme.primary.withValues(alpha: 0.25),
                      blurRadius: 12,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Spotted an Issue?',
                      style: theme.textTheme.headlineSmall?.copyWith(
                        color: theme.colorScheme.onPrimary,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Report potholes, broken streetlights, or water leaks directly to city municipal teams.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: theme.colorScheme.onPrimary.withValues(alpha: 0.9),
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ReportSubmissionScreen(),
                          ),
                        );
                        _refreshAllData();
                      },
                      icon: const Icon(Icons.add_a_photo_outlined),
                      label: const Text('File a Report'),
                      style: ElevatedButton.styleFrom(
                        foregroundColor: theme.colorScheme.primary,
                        backgroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              // Pending Offline Reports Banner
              if (_pendingCount > 0) ...[
                const SizedBox(height: 16),
                InkWell(
                  onTap: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const PendingReportsScreen(),
                      ),
                    );
                    _refreshAllData();
                  },
                  borderRadius: BorderRadius.circular(16),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      color: Colors.amber.shade50,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: Colors.amber.shade300),
                    ),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: Colors.amber.shade100,
                            shape: BoxShape.circle,
                          ),
                          child: Icon(
                            Icons.cloud_off_rounded,
                            color: Colors.amber.shade900,
                            size: 20,
                          ),
                        ),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '$_pendingCount report${_pendingCount > 1 ? 's' : ''} waiting to sync',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 14,
                                  color: Colors.amber.shade900,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                'Saved locally. Tap to view queue or retry.',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.amber.shade900.withValues(alpha: 0.8),
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: Colors.amber.shade800,
                        ),
                      ],
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),

              // Test Backend Connection Button
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () async {
                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Checking backend connection...'),
                        duration: Duration(milliseconds: 600),
                      ),
                    );
                    final isHealthy = await ApiService().checkBackendHealth();
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          isHealthy ? 'Backend connected ✅' : 'Backend unreachable ❌',
                        ),
                        backgroundColor: isHealthy ? Colors.teal.shade700 : Colors.red.shade700,
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                    if (isHealthy) {
                      _refreshAllData();
                    }
                  },
                  icon: const Icon(Icons.cloud_sync_outlined),
                  label: const Text('Test Backend Connection'),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Test Camera Capture Widget Button
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonalIcon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const CameraTestScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: const Text('Test Camera Capture Widget'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 12),

              // Test Cloudinary Upload Button
              SizedBox(
                width: double.infinity,
                child: FilledButton.tonalIcon(
                  onPressed: () {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const CloudinaryTestScreen(),
                      ),
                    );
                  },
                  icon: const Icon(Icons.cloud_upload_outlined),
                  label: const Text('Test Cloudinary Upload'),
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 13),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),

              // Quick Stats Row (Real Dynamic Counts & Interactive Filter)
              Row(
                children: [
                  _buildStatCard(
                    context,
                    title: 'Active',
                    count: _isLoadingReports ? '...' : '$_activeCount',
                    color: Colors.orange,
                    icon: Icons.pending_actions_rounded,
                    isSelected: _selectedStatusFilter == 'Active',
                    onTap: () => _onStatusCardTapped('Active'),
                  ),
                  const SizedBox(width: 12),
                  _buildStatCard(
                    context,
                    title: 'In Progress',
                    count: _isLoadingReports ? '...' : '$_inProgressCount',
                    color: Colors.blue,
                    icon: Icons.build_circle_outlined,
                    isSelected: _selectedStatusFilter == 'In Progress',
                    onTap: () => _onStatusCardTapped('In Progress'),
                  ),
                  const SizedBox(width: 12),
                  _buildStatCard(
                    context,
                    title: 'Resolved',
                    count: _isLoadingReports ? '...' : '$_resolvedCount',
                    color: Colors.green,
                    icon: Icons.check_circle_outline_rounded,
                    isSelected: _selectedStatusFilter == 'Resolved',
                    onTap: () => _onStatusCardTapped('Resolved'),
                  ),
                ],
              ),
              const SizedBox(height: 28),

              // Navigation Actions Header
              Text(
                'Quick Actions',
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 12),

              Row(
                children: [
                  Expanded(
                    child: _buildActionTile(
                      context,
                      title: 'New Report',
                      subtitle: 'Snap photo & pinpoint location',
                      icon: Icons.report_problem_outlined,
                      color: theme.colorScheme.primary,
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => const ReportSubmissionScreen(),
                          ),
                        );
                        _refreshAllData();
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: _buildActionTile(
                      context,
                      title: 'My Reports',
                      subtitle: 'Track your submissions',
                      icon: Icons.history_rounded,
                      color: Colors.indigo,
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(
                            builder: (_) => MyReportsScreen(initialFilter: _selectedStatusFilter),
                          ),
                        );
                        _refreshAllData();
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 28),

              // Recent Community Activity Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Text(
                        'Recent Activity',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (_selectedStatusFilter != 'All') ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                _selectedStatusFilter,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold,
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                              const SizedBox(width: 4),
                              GestureDetector(
                                onTap: () => setState(() => _selectedStatusFilter = 'All'),
                                child: Icon(
                                  Icons.close_rounded,
                                  size: 14,
                                  color: theme.colorScheme.primary,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                  TextButton(
                    onPressed: () async {
                      await Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => MyReportsScreen(initialFilter: _selectedStatusFilter),
                        ),
                      );
                      _refreshAllData();
                    },
                    child: const Text('View All'),
                  ),
                ],
              ),
              const SizedBox(height: 10),

              // Actual Real Reports List
              if (_isLoadingReports) ...[
                const Center(
                  child: Padding(
                    padding: EdgeInsets.symmetric(vertical: 32.0),
                    child: CircularProgressIndicator(),
                  ),
                ),
              ] else if (_reportsError != null) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.red.shade50,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(color: Colors.red.shade200),
                  ),
                  child: Column(
                    children: [
                      Icon(Icons.error_outline_rounded, color: Colors.red.shade700, size: 36),
                      const SizedBox(height: 8),
                      Text(
                        'Could not load recent reports',
                        style: TextStyle(fontWeight: FontWeight.bold, color: Colors.red.shade900),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _reportsError!,
                        style: TextStyle(fontSize: 12, color: Colors.red.shade700),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 10),
                      ElevatedButton.icon(
                        onPressed: _fetchReports,
                        icon: const Icon(Icons.refresh_rounded, size: 16),
                        label: const Text('Retry'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.red.shade700,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        ),
                      ),
                    ],
                  ),
                ),
              ] else if (displayedReports.isEmpty) ...[
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(28.0),
                  decoration: BoxDecoration(
                    color: theme.cardColor,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: theme.dividerColor.withValues(alpha: 0.3)),
                  ),
                  child: Column(
                    children: [
                      Icon(Icons.inbox_outlined, size: 48, color: Colors.grey.shade400),
                      const SizedBox(height: 12),
                      Text(
                        _selectedStatusFilter == 'All'
                            ? 'No reports submitted yet'
                            : 'No $_selectedStatusFilter reports found',
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.bold,
                          color: Colors.grey.shade700,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        _selectedStatusFilter == 'All'
                            ? 'Be the first citizen to report an infrastructure issue.'
                            : 'Tap another status card above or tap "File a Report".',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade500),
                      ),
                      if (_selectedStatusFilter != 'All') ...[
                        const SizedBox(height: 12),
                        TextButton(
                          onPressed: () => setState(() => _selectedStatusFilter = 'All'),
                          child: const Text('Show All Reports'),
                        ),
                      ],
                    ],
                  ),
                ),
              ] else ...[
                // List of real active/in-progress/resolved reports
                ListView.separated(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: displayedReports.length > 8 ? 8 : displayedReports.length,
                  separatorBuilder: (context, index) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    final report = displayedReports[index];
                    return _buildRealReportCard(context, theme, report);
                  },
                ),
              ],
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => const ReportSubmissionScreen(),
            ),
          );
          _refreshAllData();
        },
        icon: const Icon(Icons.add_a_photo_outlined),
        label: const Text('Report an Issue'),
      ),
    );
  }

  Widget _buildStatCard(
    BuildContext context, {
    required String title,
    required String count,
    required Color color,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
  }) {
    return Expanded(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 10),
            decoration: BoxDecoration(
              color: isSelected
                  ? color.withValues(alpha: 0.18)
                  : color.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isSelected ? color : color.withValues(alpha: 0.25),
                width: isSelected ? 2.0 : 1.0,
              ),
              boxShadow: isSelected
                  ? [
                      BoxShadow(
                        color: color.withValues(alpha: 0.25),
                        blurRadius: 8,
                        offset: const Offset(0, 3),
                      ),
                    ]
                  : null,
            ),
            child: Column(
              children: [
                Icon(icon, color: color, size: 24),
                const SizedBox(height: 6),
                Text(
                  count,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: color,
                  ),
                ),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.w500,
                    color: isSelected ? color : Colors.grey.shade700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildRealReportCard(
    BuildContext context,
    ThemeData theme,
    ReportModel report,
  ) {
    final statusColor = report.statusColor;

    return Card(
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.dividerColor.withValues(alpha: 0.4)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          await Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => ReportDetailScreen(report: report),
            ),
          );
          _refreshAllData();
        },
        child: Padding(
          padding: const EdgeInsets.all(12.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              // Photo Thumbnail or Category Icon
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  width: 60,
                  height: 60,
                  color: theme.colorScheme.primary.withValues(alpha: 0.08),
                  child: report.imageUrl != null && report.imageUrl!.isNotEmpty
                      ? Image.network(
                          report.imageUrl!,
                          fit: BoxFit.cover,
                          errorBuilder: (context, error, stackTrace) => Icon(
                            report.issueType.icon,
                            color: theme.colorScheme.primary,
                            size: 28,
                          ),
                          loadingBuilder: (context, child, progress) {
                            if (progress == null) return child;
                            return Center(
                              child: SizedBox(
                                width: 20,
                                height: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  value: progress.expectedTotalBytes != null
                                      ? progress.cumulativeBytesLoaded / progress.expectedTotalBytes!
                                      : null,
                                ),
                              ),
                            );
                          },
                        )
                      : Icon(
                          report.issueType.icon,
                          color: theme.colorScheme.primary,
                          size: 28,
                        ),
                ),
              ),
              const SizedBox(width: 12),

              // Title, Category, Relative Time
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      report.title,
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        Icon(
                          report.issueType.icon,
                          size: 13,
                          color: theme.colorScheme.primary,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          report.category,
                          style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          '•',
                          style: TextStyle(color: Colors.grey.shade400, fontSize: 11),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          report.formattedTimeAgo,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade500,
                          ),
                        ),
                      ],
                    ),
                    if (report.confirmationCount != null && report.confirmationCount! > 1) ...[
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                        decoration: BoxDecoration(
                          color: Colors.indigo.shade50,
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          '👥 ${report.confirmationCount} confirmed',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.indigo.shade800,
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),

              // Status Badge & Chevron
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: statusColor.withValues(alpha: 0.2)),
                    ),
                    child: Text(
                      report.normalizedStatus,
                      style: TextStyle(
                        color: statusColor,
                        fontWeight: FontWeight.bold,
                        fontSize: 11,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Icon(
                    Icons.chevron_right_rounded,
                    size: 18,
                    color: Colors.grey.shade400,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionTile(
    BuildContext context, {
    required String title,
    required String subtitle,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Theme.of(context).cardColor,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: Theme.of(context).dividerColor.withValues(alpha: 0.4),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(
              backgroundColor: color.withValues(alpha: 0.12),
              child: Icon(icon, color: color),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
