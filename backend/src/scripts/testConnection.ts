import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Testing Supabase PostgreSQL connection with PostGIS...');
  try {
    const result = await prisma.$queryRaw`SELECT PostGIS_Version();`;
    console.log('Database connection successful!');
    console.log('PostGIS Version:', result);
  } catch (error) {
    console.error('Failed to connect to the database:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
    console.log('Disconnected from database.');
  }
}

main();
