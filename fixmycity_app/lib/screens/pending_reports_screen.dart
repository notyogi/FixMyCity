import 'dart:io';

import 'package:flutter/material.dart';

import '../db/sqlite_helper.dart';
import '../models/pending_report_model.dart';
import '../models/report_model.dart';
import '../services/sync_service.dart';

/// Screen displaying all damage reports currently queued locally for offline synchronization.
class PendingReportsScreen extends StatefulWidget {
  const PendingReportsScreen({super.key});

  @override
  State<PendingReportsScreen> createState() => _PendingReportsScreenState();
}

class _PendingReportsScreenState extends State<PendingReportsScreen> {
  final SQLiteHelper _sqliteHelper = SQLiteHelper.instance;
  final SyncService _syncService = SyncService();

  List<PendingReport> _reports = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadPendingReports();
    _syncService.isSyncingNotifier.addListener(_onSyncStateChanged);
  }

  @override
  void dispose() {
    _syncService.isSyncingNotifier.removeListener(_onSyncStateChanged);
    super.dispose();
  }

  void _onSyncStateChanged() {
    if (mounted) {
      _loadPendingReports();
    }
  }

  Future<void> _loadPendingReports() async {
    setState(() => _isLoading = true);
    final items = await _sqliteHelper.getAllPendingReports();
    if (mounted) {
      setState(() {
        _reports = items;
        _isLoading = false;
      });
    }
  }

  Future<void> _syncAll() async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Starting synchronization...'),
        duration: Duration(seconds: 1),
      ),
    );
    await _syncService.syncPendingReports(retryFailedExceeded: true);
    await _loadPendingReports();
  }

  Future<void> _retrySingle(String id) async {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Retrying report sync...'),
        duration: Duration(seconds: 1),
      ),
    );
    final success = await _syncService.syncSingleReport(id);
    await _loadPendingReports();

    if (!mounted) return;
    if (success) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Report synced successfully! ✅'),
          backgroundColor: Colors.teal.shade700,
        ),
      );
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Sync retry failed. Check connection or error details.'),
          backgroundColor: Theme.of(context).colorScheme.error,
        ),
      );
    }
  }

  Future<void> _deleteReport(PendingReport report) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Discard Queued Report?'),
        content: const Text(
          'This will permanently delete this offline report and its local photo from your device.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: FilledButton.styleFrom(backgroundColor: Colors.red.shade700),
            child: const Text('Discard'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _sqliteHelper.deletePendingReport(report.id);
      try {
        final file = File(report.imageFilePath);
        if (file.existsSync()) {
          await file.delete();
        }
      } catch (_) {}
      await _loadPendingReports();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Offline Queue'),
        actions: [
          if (_reports.isNotEmpty)
            ValueListenableBuilder<bool>(
              valueListenable: _syncService.isSyncingNotifier,
              builder: (context, isSyncing, _) {
                return IconButton(
                  icon: isSyncing
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.sync_rounded),
                  tooltip: 'Sync All Pending',
                  onPressed: isSyncing ? null : _syncAll,
                );
              },
            ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _reports.isEmpty
              ? _buildEmptyState(theme)
              : RefreshIndicator(
                  onRefresh: _loadPendingReports,
                  child: ListView.separated(
                    padding: const EdgeInsets.all(16.0),
                    itemCount: _reports.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final item = _reports[index];
                      return _buildReportCard(theme, item);
                    },
                  ),
                ),
    );
  }

  Widget _buildEmptyState(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.cloud_done_rounded,
                size: 64,
                color: theme.colorScheme.primary,
              ),
            ),
            const SizedBox(height: 20),
            Text(
              'All Caught Up!',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'There are no pending offline reports. Any reports submitted without an active internet connection will appear here and auto-sync when online.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReportCard(ThemeData theme, PendingReport report) {
    final imageFile = File(report.imageFilePath);
    final fileExists = imageFile.existsSync();
    final issueDisplayName = IssueType.fromString(report.issueType).displayName;
    final severityEnum = Severity.fromString(report.severity);

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: theme.dividerColor.withValues(alpha: 0.3)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Persistent Local Photo Thumbnail
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: Container(
                    width: 72,
                    height: 72,
                    color: Colors.grey.shade200,
                    child: fileExists
                        ? Image.file(
                            imageFile,
                            fit: BoxFit.cover,
                          )
                        : const Icon(Icons.broken_image_rounded, color: Colors.grey),
                  ),
                ),
                const SizedBox(width: 14),

                // Report Details
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Expanded(
                            child: Text(
                              issueDisplayName,
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                          ),
                          _buildStatusBadge(report.syncStatus),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          _buildSeverityChip(severityEnum),
                          const SizedBox(width: 8),
                          Text(
                            '${report.latitude.toStringAsFixed(3)}, ${report.longitude.toStringAsFixed(3)}',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                      if (report.notes != null && report.notes!.isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          report.notes!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey.shade700,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            ),

            // Error & Retry Section (if failed)
            if (report.syncStatus == 'failed') ...[
              const SizedBox(height: 10),
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: Row(
                  children: [
                    Icon(Icons.error_outline_rounded,
                        color: Colors.red.shade700, size: 16),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        report.lastError ?? 'Upload failed',
                        style: TextStyle(color: Colors.red.shade900, fontSize: 12),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    Text(
                      'Retries: ${report.retryCount}',
                      style: TextStyle(fontSize: 11, color: Colors.red.shade800),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 8),
            const Divider(height: 1),
            const SizedBox(height: 4),

            // Card Action Buttons
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                IconButton(
                  icon: const Icon(Icons.delete_outline_rounded, size: 20),
                  tooltip: 'Discard',
                  color: Colors.grey.shade600,
                  onPressed: () => _deleteReport(report),
                ),
                const SizedBox(width: 4),
                TextButton.icon(
                  onPressed: () => _retrySingle(report.id),
                  icon: const Icon(Icons.refresh_rounded, size: 16),
                  label: const Text('Retry Now'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color bg;
    Color fg;
    String label;
    IconData icon;

    switch (status) {
      case 'syncing':
        bg = Colors.blue.shade50;
        fg = Colors.blue.shade800;
        label = 'Syncing...';
        icon = Icons.sync_rounded;
        break;
      case 'failed':
        bg = Colors.red.shade50;
        fg = Colors.red.shade800;
        label = 'Failed';
        icon = Icons.error_outline_rounded;
        break;
      case 'pending':
      default:
        bg = Colors.amber.shade50;
        fg = Colors.amber.shade900;
        label = 'Pending';
        icon = Icons.schedule_rounded;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: fg),
          const SizedBox(width: 4),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.bold,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSeverityChip(Severity severity) {
    Color color;
    switch (severity) {
      case Severity.LOW:
        color = Colors.green;
        break;
      case Severity.MEDIUM:
        color = Colors.amber.shade800;
        break;
      case Severity.HIGH:
        color = Colors.orange.shade800;
        break;
      case Severity.CRITICAL:
        color = Colors.red.shade700;
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        severity.displayName,
        style: TextStyle(
          color: color,
          fontSize: 10,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }
}
