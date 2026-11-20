import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../models/report_model.dart';
import '../providers/my_reports_provider.dart';
import '../providers/notifications_provider.dart';
import '../services/api_service.dart';
import 'notifications_screen.dart';
import 'report_detail_screen.dart';
import 'report_submission_screen.dart';

/// Screen allowing citizens to track their submitted reports end-to-end.
///
/// Supports personal report tracking (default, backed by [myReportsProvider])
/// and maintains backward-compatibility for community browsing when [onlyMyReports] is false.
class MyReportsScreen extends ConsumerStatefulWidget {
  final String initialFilter;
  final bool onlyMyReports;
  final String? title;

  const MyReportsScreen({
    super.key,
    this.initialFilter = 'All',
    this.onlyMyReports = true,
    this.title,
  });

  @override
  ConsumerState<MyReportsScreen> createState() => _MyReportsScreenState();
}

class _MyReportsScreenState extends ConsumerState<MyReportsScreen> {
  late final ScrollController _scrollController;

  // Fallback state for legacy community browsing (onlyMyReports == false)
  late String _communityFilter;
  List<ReportModel> _communityReports = [];
  bool _communityLoading = true;
  String? _communityError;

  String? get _currentUserId {
    try {
      return Supabase.instance.client.auth.currentUser?.id;
    } catch (_) {
      return null;
    }
  }

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();

    if (widget.onlyMyReports) {
      _scrollController.addListener(_onScroll);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        // Map initial filter
        MyReportsFilter mappedFilter = MyReportsFilter.all;
        final f = widget.initialFilter.toLowerCase();
        if (f.contains('progress')) {
          mappedFilter = MyReportsFilter.inProgress;
        } else if (f.contains('fix') || f.contains('resolve')) {
          mappedFilter = MyReportsFilter.fixed;
        } else if (f.contains('close') || f.contains('reject')) {
          mappedFilter = MyReportsFilter.closed;
        }

        ref.read(myReportsProvider.notifier).init().then((_) {
          if (mappedFilter != MyReportsFilter.all) {
            ref.read(myReportsProvider.notifier).setFilter(mappedFilter);
          }
        });
      });
    } else {
      _communityFilter = widget.initialFilter;
      _fetchCommunityReports();
    }
  }

  @override
  void dispose() {
    _scrollController.removeListener(_onScroll);
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(myReportsProvider.notifier).loadMore();
    }
  }

  // ---------------- Legacy Community Reports Fetch ----------------
  Future<void> _fetchCommunityReports() async {
    setState(() {
      _communityLoading = true;
      _communityError = null;
    });

    try {
      final currentUid = _currentUserId;
      final fetched = await ApiService().fetchReports(limit: 100);
      final scoped = currentUid != null
          ? fetched.where((rep) => rep.userId != currentUid).toList()
          : fetched;

      if (mounted) {
        setState(() {
          _communityReports = scoped;
          _communityLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _communityError = e.toString();
          _communityLoading = false;
        });
      }
    }
  }

  List<ReportModel> get _filteredCommunityReports {
    if (_communityFilter == 'All') return _communityReports;
    return _communityReports.where((rep) {
      return rep.normalizedStatus.toLowerCase() ==
          _communityFilter.toLowerCase();
    }).toList();
  }

  // ---------------- UI Builder ----------------
  @override
  Widget build(BuildContext context) {
    if (!widget.onlyMyReports) {
      return _buildCommunityView(context);
    }

    final state = ref.watch(myReportsProvider);
    final notificationsState = ref.watch(notificationsProvider);
    final unreadCount = notificationsState.unreadCount;
    final unreadReportIds = notificationsState.notifications
        .where((n) => !n.isRead)
        .map((n) => n.reportId)
        .toSet();

    final screenTitle = widget.title ?? 'My Reports';

    return Scaffold(
      appBar: AppBar(
        title: Text(screenTitle),
        actions: [
          // Bell Icon with unread badge linking to NotificationsScreen
          Stack(
            alignment: Alignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.notifications_outlined),
                tooltip: 'Notifications',
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const NotificationsScreen(),
                    ),
                  );
                },
              ),
              if (unreadCount > 0)
                Positioned(
                  top: 8,
                  right: 8,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: Colors.red,
                      shape: BoxShape.circle,
                    ),
                    constraints:
                        const BoxConstraints(minWidth: 16, minHeight: 16),
                    child: Text(
                      unreadCount > 99 ? '99+' : '$unreadCount',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.bold,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ),
                ),
            ],
          ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
            onPressed: state.isLoading
                ? null
                : () => ref
                    .read(myReportsProvider.notifier)
                    .fetchReports(isRefresh: true),
          ),
        ],
      ),
      body: Column(
        children: [
          // Offline Warning Banner
          if (state.isOfflineWarning)
            Container(
              width: double.infinity,
              color: Colors.amber.shade100,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.wifi_off_rounded,
                      size: 16, color: Colors.amber.shade900),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      "Showing saved data, couldn't refresh",
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: Colors.amber.shade900,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // User Reputation Level Header
          if (state.reputation.score > 0 || state.reputation.level.isNotEmpty)
            _buildReputationHeader(context, state.reputation),

          // 4 Summary Count Chips
          _buildSummaryChips(context, state),

          // Filter Row (All, In progress, Fixed, Closed)
          _buildFilterRow(context, state),

          const Divider(height: 1),

          // Main Reports List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () => ref
                  .read(myReportsProvider.notifier)
                  .fetchReports(isRefresh: true),
              child: _buildListContent(context, state, unreadReportIds),
            ),
          ),
        ],
      ),
    );
  }

  // ---------------- Header: Reputation Level ----------------
  Widget _buildReputationHeader(
      BuildContext context, UserReputationSummary reputation) {
    final level = reputation.level.toUpperCase();
    Color levelColor = Colors.teal;
    IconData levelIcon = Icons.shield_outlined;
    if (level == 'CHAMPION') {
      levelColor = Colors.amber.shade800;
      levelIcon = Icons.emoji_events_rounded;
    } else if (level == 'TRUSTED') {
      levelColor = Colors.indigo.shade700;
      levelIcon = Icons.verified_user_rounded;
    } else if (level == 'FLAGGED') {
      levelColor = Colors.red.shade700;
      levelIcon = Icons.warning_amber_rounded;
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 10, 16, 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: levelColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: levelColor.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(levelIcon, size: 18, color: levelColor),
          const SizedBox(width: 8),
          Text(
            'Citizen Level: ',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade700,
            ),
          ),
          Text(
            level,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.bold,
              color: levelColor,
            ),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: levelColor.withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              '${reputation.score} pts',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: levelColor,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ---------------- 4 Summary Count Chips ----------------
  Widget _buildSummaryChips(BuildContext context, MyReportsState state) {
    final counts = state.counts;
    final currentFilter = state.filter;

    final chips = [
      {
        'label': 'Total',
        'count': counts.total,
        'filter': MyReportsFilter.all,
        'color': Colors.blueGrey,
      },
      {
        'label': 'In progress',
        'count': counts.active,
        'filter': MyReportsFilter.inProgress,
        'color': Colors.blue,
      },
      {
        'label': 'Fixed',
        'count': counts.fixed,
        'filter': MyReportsFilter.fixed,
        'color': Colors.green,
      },
      {
        'label': 'Closed',
        'count': counts.rejected,
        'filter': MyReportsFilter.closed,
        'color': Colors.brown,
      },
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: chips.map((c) {
          final filter = c['filter'] as MyReportsFilter;
          final label = c['label'] as String;
          final count = c['count'] as int;
          final color = c['color'] as MaterialColor;
          final isSelected = currentFilter == filter;

          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: InkWell(
              key: ValueKey('summary_chip_${filter.name}'),
              borderRadius: BorderRadius.circular(12),
              onTap: () {
                ref.read(myReportsProvider.notifier).setFilter(filter);
              },
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color:
                      isSelected ? color.shade100 : Theme.of(context).cardColor,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isSelected ? color.shade700 : Colors.grey.shade300,
                    width: isSelected ? 1.5 : 1.0,
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight:
                            isSelected ? FontWeight.bold : FontWeight.w500,
                        color:
                            isSelected ? color.shade900 : Colors.grey.shade700,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color:
                            isSelected ? color.shade700 : Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '$count',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.bold,
                          color:
                              isSelected ? Colors.white : Colors.grey.shade800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  // ---------------- Filter Row ----------------
  Widget _buildFilterRow(BuildContext context, MyReportsState state) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
      child: Row(
        children: MyReportsFilter.values.map((filter) {
          final isSelected = state.filter == filter;
          return Padding(
            padding: const EdgeInsets.only(right: 8.0),
            child: ChoiceChip(
              key: ValueKey('filter_chip_${filter.name}'),
              label: Text(filter.label),
              selected: isSelected,
              onSelected: (selected) {
                if (selected) {
                  ref.read(myReportsProvider.notifier).setFilter(filter);
                }
              },
            ),
          );
        }).toList(),
      ),
    );
  }

  // ---------------- List Content & States ----------------
  Widget _buildListContent(
    BuildContext context,
    MyReportsState state,
    Set<String> unreadReportIds,
  ) {
    if (state.isLoading && state.reports.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.errorMessage != null && state.reports.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cloud_off_rounded,
                  size: 56, color: Colors.red.shade300),
              const SizedBox(height: 12),
              const Text(
                'Failed to load reports',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 6),
              Text(
                state.errorMessage!,
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => ref.read(myReportsProvider.notifier).init(),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (state.reports.isEmpty) {
      final isFiltered = state.filter != MyReportsFilter.all;
      return Center(
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(32.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                isFiltered
                    ? Icons.filter_list_off_rounded
                    : Icons.assignment_outlined,
                size: 64,
                color: Colors.grey.shade400,
              ),
              const SizedBox(height: 16),
              Text(
                isFiltered
                    ? 'No ${state.filter.label.toLowerCase()} reports'
                    : "You haven't submitted any reports yet",
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.grey.shade800,
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Text(
                isFiltered
                    ? 'You have no reports matching this filter.'
                    : 'Reports you submit will appear here so you can track municipal status from submission to resolution.',
                textAlign: TextAlign.center,
                style: TextStyle(color: Colors.grey.shade500, fontSize: 13),
              ),
              const SizedBox(height: 20),
              if (isFiltered)
                OutlinedButton.icon(
                  onPressed: () => ref
                      .read(myReportsProvider.notifier)
                      .setFilter(MyReportsFilter.all),
                  icon: const Icon(Icons.clear_all_rounded),
                  label: const Text('Clear Filter'),
                )
              else
                ElevatedButton.icon(
                  onPressed: () async {
                    await Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => const ReportSubmissionScreen(),
                      ),
                    );
                    ref
                        .read(myReportsProvider.notifier)
                        .fetchReports(isRefresh: true);
                  },
                  icon: const Icon(Icons.add_a_photo_outlined),
                  label: const Text('File a Report'),
                ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      controller: _scrollController,
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16.0),
      itemCount: state.reports.length + (state.isLoadingMore ? 1 : 0),
      separatorBuilder: (_, _) => const SizedBox(height: 12),
      itemBuilder: (context, index) {
        if (index >= state.reports.length) {
          return const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        }

        final report = state.reports[index];
        final hasUnreadNotification = unreadReportIds.contains(report.id);

        return _buildReportCard(context, report, hasUnreadNotification);
      },
    );
  }

  // ---------------- Report Card ----------------
  Widget _buildReportCard(
    BuildContext context,
    ReportModel report,
    bool hasUnreadNotification,
  ) {
    final theme = Theme.of(context);
    final isPending = !report.isSynced;

    return Card(
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: theme.dividerColor.withValues(alpha: 0.3)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () {
          if (isPending) {
            _showPendingItemDialog(context, report);
          } else {
            Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ReportDetailScreen(report: report),
              ),
            );
          }
        },
        child: Padding(
          padding: const EdgeInsets.all(14.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Photo Thumbnail
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      width: 72,
                      height: 72,
                      color: theme.colorScheme.primary.withValues(alpha: 0.08),
                      child: _buildThumbnailImage(report, theme),
                    ),
                  ),
                  const SizedBox(width: 12),

                  // Header Info & Chips
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                report.title,
                                style: const TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.bold,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            // Unread Notification Dot
                            if (hasUnreadNotification) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.blue.shade600,
                                  borderRadius: BorderRadius.circular(10),
                                ),
                                child: const Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Icon(Icons.circle,
                                        size: 6, color: Colors.white),
                                    SizedBox(width: 4),
                                    Text(
                                      'New update',
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontSize: 9,
                                        fontWeight: FontWeight.bold,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                        const SizedBox(height: 6),

                        // Status Badge
                        _buildStatusBadge(report),

                        const SizedBox(height: 6),
                        // Issue Type, Severity, and Relative Time
                        Row(
                          children: [
                            Icon(
                              report.issueType.icon,
                              size: 13,
                              color: theme.colorScheme.primary,
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                report.category,
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: theme.colorScheme.primary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 6),
                            // Severity Chip
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                color: report.severity.color
                                    .withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text(
                                report.severity.displayName,
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.bold,
                                  color: report.severity.color,
                                ),
                              ),
                            ),
                            const SizedBox(width: 6),
                            Text(
                              '• ${report.formattedTimeAgo}',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.grey.shade500,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),

              // Cluster confirmation text
              if (report.confirmationCount != null &&
                  report.confirmationCount! > 1) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.indigo.shade50,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.indigo.shade200),
                  ),
                  child: Text(
                    '👥 ${report.confirmationCount} people confirmed this cluster',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: Colors.indigo.shade800,
                    ),
                  ),
                ),
              ],

              // Sensitive Location Tag
              if (report.nearSensitiveLocation) ...[
                const SizedBox(height: 6),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: Colors.deepOrange.shade50,
                    borderRadius: BorderRadius.circular(6),
                    border: Border.all(color: Colors.deepOrange.shade200),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.warning_amber_rounded,
                          size: 13, color: Colors.deepOrange.shade800),
                      const SizedBox(width: 4),
                      Text(
                        'Near sensitive municipal area',
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.deepOrange.shade800,
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              const SizedBox(height: 12),
              // 4-step Progress Indicator
              _buildProgressIndicator(context, report),
            ],
          ),
        ),
      ),
    );
  }

  // ---------------- Thumbnail Image Builder ----------------
  Widget _buildThumbnailImage(ReportModel report, ThemeData theme) {
    if (!report.isSynced) {
      if (report.imageUrl != null && File(report.imageUrl!).existsSync()) {
        return Image.file(
          File(report.imageUrl!),
          fit: BoxFit.cover,
          errorBuilder: (_, _, _) => Icon(
            report.issueType.icon,
            color: theme.colorScheme.primary,
            size: 28,
          ),
        );
      }
      return Icon(report.issueType.icon,
          color: theme.colorScheme.primary, size: 28);
    }

    if (report.imageUrl != null && report.imageUrl!.isNotEmpty) {
      return Image.network(
        report.imageUrl!,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => Icon(
          report.issueType.icon,
          color: theme.colorScheme.primary,
          size: 28,
        ),
      );
    }

    return Icon(report.issueType.icon,
        color: theme.colorScheme.primary, size: 28);
  }

  // ---------------- Status Badge Builder ----------------
  Widget _buildStatusBadge(ReportModel report) {
    if (!report.isSynced) {
      final isFailed = report.status == 'FAILED_SYNC';
      final badgeColor = isFailed ? Colors.red.shade700 : Colors.amber.shade900;
      final badgeBg = isFailed ? Colors.red.shade50 : Colors.amber.shade50;
      final text = isFailed ? 'Failed to sync' : 'Waiting to sync';

      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: badgeBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: badgeColor.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isFailed ? Icons.error_outline_rounded : Icons.sync_rounded,
              size: 11,
              color: badgeColor,
            ),
            const SizedBox(width: 4),
            Text(
              text,
              style: TextStyle(
                color: badgeColor,
                fontWeight: FontWeight.bold,
                fontSize: 10,
              ),
            ),
          ],
        ),
      );
    }

    final status = report.status.toUpperCase();
    Color statusColor = Colors.orange.shade800;
    String statusLabel = 'Submitted';

    if (status == 'UNDER_REVIEW') {
      statusColor = Colors.blue.shade700;
      statusLabel = 'Under Review';
    } else if (status == 'SCHEDULED') {
      statusColor = Colors.indigo.shade700;
      statusLabel = 'Scheduled';
    } else if (status == 'FIXED' || status == 'RESOLVED') {
      statusColor = Colors.green.shade700;
      statusLabel = 'Fixed';
    } else if (status == 'REJECTED') {
      statusColor = Colors.brown.shade700;
      statusLabel = 'Closed';
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: statusColor.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        statusLabel,
        style: TextStyle(
          color: statusColor,
          fontWeight: FontWeight.bold,
          fontSize: 11,
        ),
      ),
    );
  }

  // ---------------- 4-Step Progress Indicator ----------------
  Widget _buildProgressIndicator(BuildContext context, ReportModel report) {
    final status = report.status.toUpperCase();

    // If REJECTED, show a neutral closed message (no mention of spam or reputation loss)
    if (status == 'REJECTED') {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.grey.shade100,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.grey.shade300),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.info_outline_rounded,
                size: 14, color: Colors.grey.shade700),
            const SizedBox(width: 6),
            Text(
              "Closed - couldn't be acted on",
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: Colors.grey.shade700,
              ),
            ),
          ],
        ),
      );
    }

    final steps = ['Submitted', 'Under review', 'Scheduled', 'Fixed'];

    int currentStepIndex = 0;
    if (!report.isSynced) {
      currentStepIndex = 0;
    } else if (status == 'FIXED' || status == 'RESOLVED') {
      currentStepIndex = 3;
    } else if (status == 'SCHEDULED') {
      currentStepIndex = 2;
    } else if (status == 'UNDER_REVIEW' || status == 'IN_PROGRESS') {
      currentStepIndex = 1;
    } else {
      currentStepIndex = 0;
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: List.generate(steps.length * 2 - 1, (index) {
            if (index.isOdd) {
              final stepIndex = index ~/ 2;
              final isPassed = stepIndex < currentStepIndex;
              return Expanded(
                child: Container(
                  height: 2,
                  color: isPassed ? Colors.teal.shade600 : Colors.grey.shade300,
                ),
              );
            } else {
              final stepIndex = index ~/ 2;
              final isCompleted = stepIndex <= currentStepIndex;
              final isCurrent = stepIndex == currentStepIndex;
              return Container(
                width: 18,
                height: 18,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color:
                      isCompleted ? Colors.teal.shade600 : Colors.grey.shade200,
                  border: Border.all(
                    color: isCurrent
                        ? Colors.teal.shade800
                        : (isCompleted
                            ? Colors.teal.shade600
                            : Colors.grey.shade400),
                    width: 1.5,
                  ),
                ),
                child: isCompleted
                    ? const Icon(Icons.check, size: 11, color: Colors.white)
                    : null,
              );
            }
          }),
        ),
        const SizedBox(height: 4),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: steps.asMap().entries.map((entry) {
            final idx = entry.key;
            final label = entry.value;
            final isActive = idx <= currentStepIndex;
            return Expanded(
              child: Text(
                label,
                textAlign: idx == 0
                    ? TextAlign.left
                    : (idx == steps.length - 1
                        ? TextAlign.right
                        : TextAlign.center),
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: isActive ? FontWeight.bold : FontWeight.normal,
                  color: isActive ? Colors.teal.shade900 : Colors.grey.shade500,
                ),
              ),
            );
          }).toList(),
        ),
      ],
    );
  }

  // ---------------- Pending Item Dialog ----------------
  Future<void> _showPendingItemDialog(
      BuildContext context, ReportModel report) async {
    final isFailed = report.status == 'FAILED_SYNC';
    await showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(
                      isFailed
                          ? Icons.error_outline_rounded
                          : Icons.sync_rounded,
                      color: isFailed ? Colors.red : Colors.orange,
                    ),
                    const SizedBox(width: 10),
                    Text(
                      isFailed
                          ? 'Failed Offline Report'
                          : 'Queued Offline Report',
                      style: const TextStyle(
                          fontSize: 17, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  isFailed
                      ? 'This report failed to synchronize with the server. You can retry now or discard it.'
                      : 'This report is stored locally on your device and will sync automatically when network is available.',
                  style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
                ),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.delete_outline_rounded,
                            color: Colors.red),
                        label: const Text('Delete',
                            style: TextStyle(color: Colors.red)),
                        onPressed: () async {
                          Navigator.pop(ctx);
                          final confirm = await showDialog<bool>(
                            context: context,
                            builder: (c) => AlertDialog(
                              title: const Text('Discard Queued Report?'),
                              content: const Text(
                                  'This will delete the offline report and photo permanently from your device.'),
                              actions: [
                                TextButton(
                                  onPressed: () => Navigator.pop(c, false),
                                  child: const Text('Cancel'),
                                ),
                                TextButton(
                                  onPressed: () => Navigator.pop(c, true),
                                  child: const Text('Delete',
                                      style: TextStyle(color: Colors.red)),
                                ),
                              ],
                            ),
                          );
                          if (confirm == true) {
                            await ref
                                .read(myReportsProvider.notifier)
                                .deletePendingReport(
                                    report.id, report.imageUrl);
                          }
                        },
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: ElevatedButton.icon(
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('Retry Sync'),
                        onPressed: () async {
                          Navigator.pop(ctx);
                          ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(
                              content: Text('Retrying report sync...'),
                              duration: Duration(seconds: 1),
                            ),
                          );
                          final success = await ref
                              .read(myReportsProvider.notifier)
                              .retryPendingReport(report.id);
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                content: Text(success
                                    ? 'Report synced successfully! ✅'
                                    : 'Sync retry failed. Check connection.'),
                                backgroundColor: success
                                    ? Colors.teal.shade700
                                    : Colors.red.shade700,
                              ),
                            );
                          }
                        },
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  // ---------------- Community Reports Fallback View ----------------
  Widget _buildCommunityView(BuildContext context) {
    final displayed = _filteredCommunityReports;

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title ?? 'Community Reports'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
            onPressed: _communityLoading ? null : _fetchCommunityReports,
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips Row
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding:
                const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
            child: Row(
              children:
                  ['All', 'Active', 'In Progress', 'Resolved'].map((filter) {
                final isSelected =
                    _communityFilter.toLowerCase() == filter.toLowerCase();
                return Padding(
                  padding: const EdgeInsets.only(right: 8.0),
                  child: FilterChip(
                    label: Text(filter),
                    selected: isSelected,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() => _communityFilter = filter);
                      }
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchCommunityReports,
              child: _communityLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _communityError != null
                      ? Center(child: Text(_communityError!))
                      : displayed.isEmpty
                          ? const Center(
                              child: Text('No community reports found'))
                          : ListView.separated(
                              padding: const EdgeInsets.all(16),
                              itemCount: displayed.length,
                              separatorBuilder: (_, _) =>
                                  const SizedBox(height: 12),
                              itemBuilder: (context, index) {
                                final report = displayed[index];
                                return Card(
                                  child: ListTile(
                                    leading: ClipRRect(
                                      borderRadius: BorderRadius.circular(8),
                                      child: report.imageUrl != null &&
                                              report.imageUrl!.isNotEmpty
                                          ? Image.network(
                                              report.imageUrl!,
                                              width: 50,
                                              height: 50,
                                              fit: BoxFit.cover,
                                              errorBuilder: (_, _, _) =>
                                                  Icon(report.issueType.icon),
                                            )
                                          : Icon(report.issueType.icon),
                                    ),
                                    title: Text(report.title),
                                    subtitle: Text(
                                        '${report.category} • ${report.formattedTimeAgo}'),
                                    trailing:
                                        const Icon(Icons.chevron_right_rounded),
                                    onTap: () {
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) => ReportDetailScreen(
                                              report: report),
                                        ),
                                      );
                                    },
                                  ),
                                );
                              },
                            ),
            ),
          ),
        ],
      ),
    );
  }
}
