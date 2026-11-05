-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older PostgreSQL.
ALTER TYPE "NotificationChannel" ADD VALUE IF NOT EXISTS 'IN_APP';
