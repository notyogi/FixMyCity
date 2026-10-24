import 'package:flutter/material.dart';
import '../models/report_model.dart';
import '../services/api_service.dart';
import 'report_detail_screen.dart';

class MyReportsScreen extends StatefulWidget {
  final String initialFilter;

  const MyReportsScreen({
    super.key,
    this.initialFilter = 'All',
  });

  @override
  State<MyReportsScreen> createState() => _MyReportsScreenState();
}

class _MyReportsScreenState extends State<MyReportsScreen> {
  late String _selectedFilter;
  List<ReportModel> _reports = [];
  bool _isLoading = true;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _selectedFilter = widget.initialFilter;
    _fetchReports();
  }

  Future<void> _fetchReports() async {
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final fetched = await ApiService().fetchReports(limit: 100);
      if (mounted) {
        setState(() {
          _reports = fetched;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _errorMessage = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  List<ReportModel> get _filteredReports {
    if (_selectedFilter == 'All') return _reports;
    return _reports.where((rep) {
      return rep.normalizedStatus.toLowerCase() == _selectedFilter.toLowerCase();
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final displayedReports = _filteredReports;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Community Reports'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _fetchReports,
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Chips Row
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 12.0),
            child: Row(
              children: ['All', 'Active', 'In Progress', 'Resolved'].map((filter) {
                final isSelected = _selectedFilter.toLowerCase() == filter.toLowerCase();
                int count = 0;
                if (filter == 'All') {
                  count = _reports.length;
                } else {
                  count = _reports.where((r) => r.normalizedStatus.toLowerCase() == filter.toLowerCase()).length;
                }

                return Padding(
                  padding: const EdgeInsets.only(right: 8.0),
                  child: FilterChip(
                    label: Text('$filter ($count)'),
                    selected: isSelected,
                    selectedColor: theme.colorScheme.primaryContainer,
                    onSelected: (selected) {
                      if (selected) {
                        setState(() {
                          _selectedFilter = filter;
                        });
                      }
                    },
                  ),
                );
              }).toList(),
            ),
          ),
          const Divider(height: 1),

          // Reports List
          Expanded(
            child: RefreshIndicator(
              onRefresh: _fetchReports,
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : _errorMessage != null
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24.0),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.cloud_off_rounded, size: 56, color: Colors.red.shade300),
                                const SizedBox(height: 12),
                                const Text(
                                  'Failed to load reports',
                                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                                ),
                                const SizedBox(height: 6),
                                Text(
                                  _errorMessage!,
                                  textAlign: TextAlign.center,
                                  style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
                                ),
                                const SizedBox(height: 16),
                                ElevatedButton.icon(
                                  onPressed: _fetchReports,
                                  icon: const Icon(Icons.refresh_rounded),
                                  label: const Text('Retry'),
                                ),
                              ],
                            ),
                          ),
                        )
                      : displayedReports.isEmpty
                          ? Center(
                              child: SingleChildScrollView(
                                physics: const AlwaysScrollableScrollPhysics(),
                                child: Padding(
                                  padding: const EdgeInsets.all(32.0),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(
                                        Icons.inbox_outlined,
                                        size: 64,
                                        color: Colors.grey.shade400,
                                      ),
                                      const SizedBox(height: 16),
                                      Text(
                                        'No $_selectedFilter reports found',
                                        style: TextStyle(
                                          color: Colors.grey.shade700,
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                      const SizedBox(height: 8),
                                      Text(
                                        'Pull down to refresh or change the filter above.',
                                        textAlign: TextAlign.center,
                                        style: TextStyle(
                                          color: Colors.grey.shade500,
                                          fontSize: 13,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                            )
                          : ListView.separated(
                              padding: const EdgeInsets.all(16.0),
                              itemCount: displayedReports.length,
                              separatorBuilder: (context, index) => const SizedBox(height: 12),
                              itemBuilder: (context, index) {
                                final report = displayedReports[index];
                                final statusColor = report.statusColor;

                                return Card(
                                  elevation: 0,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(16),
                                    side: BorderSide(
                                      color: theme.dividerColor.withValues(alpha: 0.4),
                                    ),
                                  ),
                                  child: InkWell(
                                    borderRadius: BorderRadius.circular(16),
                                    onTap: () {
                                      Navigator.of(context).push(
                                        MaterialPageRoute(
                                          builder: (_) => ReportDetailScreen(report: report),
                                        ),
                                      );
                                    },
                                    child: Padding(
                                      padding: const EdgeInsets.all(14.0),
                                      child: Row(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          // Thumbnail
                                          ClipRRect(
                                            borderRadius: BorderRadius.circular(12),
                                            child: Container(
                                              width: 70,
                                              height: 70,
                                              color: theme.colorScheme.primary.withValues(alpha: 0.08),
                                              child: report.imageUrl != null && report.imageUrl!.isNotEmpty
                                                  ? Image.network(
                                                      report.imageUrl!,
                                                      fit: BoxFit.cover,
                                                      errorBuilder: (context, error, stackTrace) => Icon(
                                                        report.issueType.icon,
                                                        color: theme.colorScheme.primary,
                                                        size: 30,
                                                      ),
                                                    )
                                                  : Icon(
                                                      report.issueType.icon,
                                                      color: theme.colorScheme.primary,
                                                      size: 30,
                                                    ),
                                            ),
                                          ),
                                          const SizedBox(width: 14),

                                          // Content
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
                                                    Container(
                                                      padding: const EdgeInsets.symmetric(
                                                        horizontal: 8,
                                                        vertical: 3,
                                                      ),
                                                      decoration: BoxDecoration(
                                                        color: statusColor.withValues(alpha: 0.12),
                                                        borderRadius: BorderRadius.circular(16),
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
                                                  ],
                                                ),
                                                const SizedBox(height: 6),
                                                Text(
                                                  report.notes != null && report.notes!.isNotEmpty
                                                      ? report.notes!
                                                      : (report.description.isNotEmpty
                                                          ? report.description
                                                          : 'No description provided'),
                                                  style: TextStyle(
                                                    fontSize: 13,
                                                    color: Colors.grey.shade600,
                                                  ),
                                                  maxLines: 2,
                                                  overflow: TextOverflow.ellipsis,
                                                ),
                                                const SizedBox(height: 8),
                                                Row(
                                                  children: [
                                                    Icon(
                                                      report.issueType.icon,
                                                      size: 14,
                                                      color: theme.colorScheme.primary,
                                                    ),
                                                    const SizedBox(width: 4),
                                                    Text(
                                                      report.category,
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        fontWeight: FontWeight.w500,
                                                        color: theme.colorScheme.primary,
                                                      ),
                                                    ),
                                                    const Spacer(),
                                                    Icon(
                                                      Icons.access_time_rounded,
                                                      size: 13,
                                                      color: Colors.grey.shade500,
                                                    ),
                                                    const SizedBox(width: 4),
                                                    Text(
                                                      report.formattedTimeAgo,
                                                      style: TextStyle(
                                                        fontSize: 12,
                                                        color: Colors.grey.shade500,
                                                      ),
                                                    ),
                                                  ],
                                                ),
                                                if (report.confirmationCount != null &&
                                                    report.confirmationCount! > 1) ...[
                                                  const SizedBox(height: 6),
                                                  Container(
                                                    padding: const EdgeInsets.symmetric(
                                                      horizontal: 6,
                                                      vertical: 2,
                                                    ),
                                                    decoration: BoxDecoration(
                                                      color: Colors.indigo.shade50,
                                                      borderRadius: BorderRadius.circular(6),
                                                      border: Border.all(
                                                        color: Colors.indigo.shade200,
                                                      ),
                                                    ),
                                                    child: Text(
                                                      '👥 ${report.confirmationCount} citizens confirmed this cluster',
                                                      style: TextStyle(
                                                        fontSize: 11,
                                                        fontWeight: FontWeight.w600,
                                                        color: Colors.indigo.shade800,
                                                      ),
                                                    ),
                                                  ),
                                                ],
                                              ],
                                            ),
                                          ),
                                          const SizedBox(width: 8),
                                          Icon(
                                            Icons.chevron_right_rounded,
                                            color: Colors.grey.shade400,
                                          ),
                                        ],
                                      ),
                                    ),
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
