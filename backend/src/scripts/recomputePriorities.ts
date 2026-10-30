import prisma from '../utils/prisma';
import { recomputeAllPriorityScores } from '../services/priority.service';
import { ReportStatus, Severity } from '@prisma/client';
import { SEVERITY_VALUES } from '../config/priority.config';

async function main() {
  console.log('Starting priority score recomputation across all clusters...');
  const startTime = Date.now();

  const updatedCount = await recomputeAllPriorityScores();
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`Recomputed priority scores for ${updatedCount} cluster(s) in ${elapsed}s.\n`);

  // Query top 10 clusters by priority score
  const topClusters = await prisma.reportCluster.findMany({
    take: 10,
    orderBy: { priority_score: 'desc' },
    include: {
      reports: {
        where: {
          status: {
            notIn: [ReportStatus.FIXED, ReportStatus.REJECTED],
          },
        },
        select: {
          severity: true,
          near_sensitive_location: true,
        },
      },
    },
  });

  if (topClusters.length === 0) {
    console.log('No clusters currently exist in the database.');
    return;
  }

  const tableData = topClusters.map((cluster, index) => {
    let maxSeverity: Severity | 'NONE' = 'NONE';
    let maxSeverityVal = 0;
    for (const r of cluster.reports) {
      const val = SEVERITY_VALUES[r.severity] ?? 0;
      if (val > maxSeverityVal) {
        maxSeverityVal = val;
        maxSeverity = r.severity;
      }
    }

    return {
      Rank: index + 1,
      'Cluster ID': cluster.id,
      'Max Severity': maxSeverity,
      'Confirmation Count': cluster.confirmation_count,
      'Priority Score': cluster.priority_score,
    };
  });

  console.log('Top 10 Clusters by Priority Score:');
  console.table(tableData);
}

main()
  .catch((err) => {
    console.error('Fatal error during priority recomputation:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

