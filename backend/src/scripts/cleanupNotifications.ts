import prisma from '../utils/prisma';

export async function cleanupOldReadNotifications(): Promise<number> {
  const retentionDays = process.env.NOTIFICATION_RETENTION_DAYS
    ? parseInt(process.env.NOTIFICATION_RETENTION_DAYS, 10) || 30
    : 30;

  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

  const result = await prisma.notification.deleteMany({
    where: {
      read_at: {
        not: null,
        lte: cutoff,
      },
    },
  });

  return result.count;
}

async function main() {
  const retentionDays = process.env.NOTIFICATION_RETENTION_DAYS
    ? parseInt(process.env.NOTIFICATION_RETENTION_DAYS, 10) || 30
    : 30;

  console.log(`[cleanupNotifications] Deleting read notifications older than ${retentionDays} days...`);
  try {
    const count = await cleanupOldReadNotifications();
    console.log(`[cleanupNotifications] Successfully deleted ${count} old read notifications.`);
  } catch (error) {
    console.error('[cleanupNotifications] Error during cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main();
}
