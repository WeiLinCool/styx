import { eq, sql } from 'drizzle-orm';

import { db, schema } from '@/server/db';
import { getAdminUserCreditBalance } from '@/server/repositories/users';

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    throw new Error('userId is required');
  }

  if (!db) {
    throw new Error('db unavailable');
  }

  const [row] = await db
    .select({ user: schema.users })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  const [ledger] = await db
    .select({
      amount: sql<number>`coalesce(sum(${schema.creditLedgerEntries.amount}), 0)::numeric`,
    })
    .from(schema.creditLedgerEntries)
    .where(eq(schema.creditLedgerEntries.userId, userId));

  console.log(
    JSON.stringify(
      {
        found: Boolean(row),
        metadata: row?.user.metadata ?? null,
        ledgerAmount: ledger?.amount ?? null,
        computed: row ? await getAdminUserCreditBalance(row.user) : null,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
