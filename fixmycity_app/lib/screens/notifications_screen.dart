import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/notification_model.dart';
import '../providers/notifications_provider.dart';
import '../services/api_service.dart';
import 'report_detail_screen.dart';

class NotificationsScreen extends ConsumerStatefulWidget {
  const NotificationsScreen({super.key});

  @override
  ConsumerState<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends ConsumerState<NotificationsScreen> {
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(notificationsProvider.notifier).fetchNotifications(isRefresh: true);
    });
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
      ref.read(notificationsProvider.notifier).loadMore();
    }
  }

  String _formatRelativeTime(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);

    if (difference.inSeconds < 60) {
      return 'Just now';
    } else if (difference.inMinutes < 60) {
      return '${difference.inMinutes}m ago';
    } else if (difference.inHours < 24) {
      return '${difference.inHours}h ago';
    } else if (difference.inDays < 7) {
      return '${difference.inDays}d ago';
    } else {
      return '${dateTime.day}/${dateTime.month}/${dateTime.year}';
    }
  }

  IconData _getStatusIcon(String? status) {
    switch (status?.toUpperCase()) {
      case 'UNDER_REVIEW':
        return Icons.search_rounded;
      case 'SCHEDULED':
        return Icons.calendar_today_rounded;
      case 'FIXED':
        return Icons.check_circle_rounded;
      case 'REJECTED':
        return Icons.do_not_disturb_on_outlined;
      default:
        return Icons.notifications_rounded;
    }
  }

  Color _getStatusColor(String? status, ThemeData theme) {
    switch (status?.toUpperCase()) {
      case 'UNDER_REVIEW':
        return Colors.orange.shade700;
      case 'SCHEDULED':
        return Colors.blue.shade700;
      case 'FIXED':
        return Colors.green.shade700;
      case 'REJECTED':
        return Colors.grey.shade700;
      default:
        return theme.colorScheme.primary;
    }
  }

  Future<void> _handleNotificationTap(NotificationModel item) async {
    // 1. Mark as read optimistically
    if (!item.isRead) {
      ref.read(notificationsProvider.notifier).markAsRead(item.id);
    }

    // 2. Fetch report and open ReportDetailScreen
    if (item.reportId.isEmpty) return;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => const Center(
        child: Card(
          elevation: 4,
          child: Padding(
            padding: EdgeInsets.all(20),
            child: CircularProgressIndicator(),
          ),
        ),
      ),
    );

    try {
      final report = await ApiService().fetchReportById(item.reportId);
      if (mounted) {
        Navigator.of(context).pop(); // Dismiss loading
        await Navigator.of(context).push(
          MaterialPageRoute(
            builder: (_) => ReportDetailScreen(report: report),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.of(context).pop(); // Dismiss loading
        final errorStr = e.toString().toLowerCase();
        final isNotFound = errorStr.contains('404') || errorStr.contains('not found');
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              isNotFound
                  ? 'This report is no longer available or was removed.'
                  : 'Could not load report details. Please check your connection.',
            ),
            backgroundColor: isNotFound ? Colors.amber.shade900 : Colors.red.shade700,
            duration: const Duration(seconds: 3),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final state = ref.watch(notificationsProvider);
    final hasUnread = state.unreadCount > 0 ||
        state.notifications.any((n) => !n.isRead);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          TextButton.icon(
            onPressed: hasUnread
                ? () => ref.read(notificationsProvider.notifier).markAllAsRead()
                : null,
            icon: const Icon(Icons.done_all_rounded, size: 20),
            label: const Text('Mark all read'),
            style: TextButton.styleFrom(
              minimumSize: const Size(48, 48),
            ),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter & Offline status bar
          _buildFilterBar(state, theme),

          if (state.isOfflineWarning)
            Container(
              width: double.infinity,
              color: Colors.amber.shade100,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Icon(Icons.wifi_off_rounded, size: 16, color: Colors.amber.shade900),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      "You're offline. Showing last loaded notifications.",
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.amber.shade900,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Main Content Area
          Expanded(
            child: _buildBody(state, theme),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar(NotificationsState state, ThemeData theme) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          bottom: BorderSide(
            color: theme.colorScheme.outlineVariant.withValues(alpha: 0.5),
          ),
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(
            state.unreadCount > 0
                ? '${state.unreadCount} unread'
                : 'All caught up',
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w600,
              color: state.unreadCount > 0
                  ? theme.colorScheme.primary
                  : Colors.grey.shade600,
            ),
          ),
          FilterChip(
            selected: state.unreadOnlyFilter,
            label: const Text('Unread only'),
            avatar: state.unreadOnlyFilter
                ? const Icon(Icons.check, size: 16)
                : null,
            onSelected: (val) {
              ref.read(notificationsProvider.notifier).setUnreadOnlyFilter(val);
            },
          ),
        ],
      ),
    );
  }

  Widget _buildBody(NotificationsState state, ThemeData theme) {
    // 1. Initial Loading Skeleton
    if (state.isLoading && state.notifications.isEmpty) {
      return _buildSkeletonLoader(theme);
    }

    // 2. Error state (no cached data)
    if (state.errorMessage != null && state.notifications.isEmpty) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.error_outline_rounded, size: 48, color: Colors.red.shade400),
              const SizedBox(height: 16),
              Text(
                state.errorMessage!,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(color: Colors.grey.shade700),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: () => ref.read(notificationsProvider.notifier).fetchNotifications(),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  minimumSize: const Size(120, 48),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // 3. Empty State
    if (state.notifications.isEmpty) {
      return RefreshIndicator(
        onRefresh: () => ref
            .read(notificationsProvider.notifier)
            .fetchNotifications(isRefresh: true),
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          children: [
            SizedBox(
              height: MediaQuery.of(context).size.height * 0.5,
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(
                        Icons.notifications_none_rounded,
                        size: 64,
                        color: Colors.grey.shade400,
                      ),
                      const SizedBox(height: 16),
                      Text(
                        state.unreadOnlyFilter
                            ? 'No unread notifications'
                            : 'No notifications yet',
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: Colors.grey.shade800,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        state.unreadOnlyFilter
                            ? "You've read all your status updates."
                            : "We'll let you know when authorities act on your reports.",
                        textAlign: TextAlign.center,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: Colors.grey.shade600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ],
        ),
      );
    }

    // 4. Notifications List
    return RefreshIndicator(
      onRefresh: () => ref
          .read(notificationsProvider.notifier)
          .fetchNotifications(isRefresh: true),
      child: ListView.separated(
        controller: _scrollController,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: state.notifications.length + (state.hasMore ? 1 : 0),
        separatorBuilder: (_, __) => Divider(
          height: 1,
          thickness: 1,
          color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3),
        ),
        itemBuilder: (context, index) {
          if (index == state.notifications.length) {
            return const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            );
          }

          final item = state.notifications[index];
          final isUnread = !item.isRead;
          final statusColor = _getStatusColor(item.newStatus, theme);
          final statusIcon = _getStatusIcon(item.newStatus);

          return Material(
            color: isUnread
                ? theme.colorScheme.primaryContainer.withValues(alpha: 0.15)
                : theme.colorScheme.surface,
            child: InkWell(
              onTap: () => _handleNotificationTap(item),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Status Badge Icon
                    Container(
                      width: 44,
                      height: 44,
                      decoration: BoxDecoration(
                        color: statusColor.withValues(alpha: 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(statusIcon, color: statusColor, size: 24),
                    ),
                    const SizedBox(width: 14),

                    // Title, Body, Timestamp
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  item.title,
                                  style: theme.textTheme.bodyLarge?.copyWith(
                                    fontWeight: isUnread ? FontWeight.bold : FontWeight.w500,
                                    color: isUnread
                                        ? theme.colorScheme.onSurface
                                        : Colors.grey.shade700,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                _formatRelativeTime(item.createdAt),
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: Colors.grey.shade500,
                                ),
                              ),
                              if (isUnread) ...[
                                const SizedBox(width: 8),
                                Container(
                                  width: 8,
                                  height: 8,
                                  decoration: BoxDecoration(
                                    color: theme.colorScheme.primary,
                                    shape: BoxShape.circle,
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 4),
                          Text(
                            item.body,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: isUnread
                                  ? theme.colorScheme.onSurfaceVariant
                                  : Colors.grey.shade600,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildSkeletonLoader(ThemeData theme) {
    return ListView.separated(
      physics: const NeverScrollableScrollPhysics(),
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: 6,
      separatorBuilder: (_, __) => Divider(
        height: 1,
        color: theme.colorScheme.outlineVariant.withValues(alpha: 0.3),
      ),
      itemBuilder: (_, __) {
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.grey.shade200,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 160,
                      height: 16,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Container(
                      width: double.infinity,
                      height: 12,
                      decoration: BoxDecoration(
                        color: Colors.grey.shade200,
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}
