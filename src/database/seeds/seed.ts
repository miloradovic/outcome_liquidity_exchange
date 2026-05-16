/**
 * Seed script: populates demo users and markets.
 * Idempotent — safe to run multiple times.
 *
 * Usage: npm run seed
 * Requires: DATABASE env vars set (or .env file present)
 */
import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../data-source';
import { User } from '../../modules/users/entities/user.entity';
import { Market } from '../../modules/markets/entities/market.entity';
import { Outcome } from '../../modules/markets/entities/outcome.entity';
import { MarketStatus } from '../../modules/markets/enums/market-status.enum';
import { OutcomeSide } from '../../modules/markets/enums/outcome-side.enum';
import { Wallet } from '../../modules/wallet/entities/wallet.entity';

const DEMO_PASSWORD = 'demo only';
const BCRYPT_ROUNDS = 10;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY_IN_MS);
}

const DEMO_USERS = [
  { email: 'alice@demo.com', username: 'alice' },
  { email: 'bob@demo.com', username: 'bob' },
];

const DEMO_MARKETS: Array<{
  slug: string;
  title: string;
  closesAt: Date;
}> = [
  {
    slug: 'btc-100k-2025',
    title: 'Will Bitcoin reach $100,000 by end of 2025?',
    closesAt: daysFromNow(180),
  },
  {
    slug: 'fed-rate-cut-q1-2026',
    title: 'Will the Federal Reserve cut rates in Q1 2026?',
    closesAt: daysFromNow(365),
  },
  {
    slug: 'ai-turing-test-2027',
    title: 'Will an AI pass the Turing Test before 2028?',
    closesAt: daysFromNow(730),
  },
];

async function seed(): Promise<void> {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  console.log('Connected.');

  const userRepo = AppDataSource.getRepository(User);
  const marketRepo = AppDataSource.getRepository(Market);
  const outcomeRepo = AppDataSource.getRepository(Outcome);
  const walletRepo = AppDataSource.getRepository(Wallet);

  // Seed demo users
  console.log('\n--- Seeding demo users ---');
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  for (const demo of DEMO_USERS) {
    let user = await userRepo
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: demo.email })
      .getOne();
    if (!user) {
      user = await userRepo.save(
        userRepo.create({ email: demo.email, username: demo.username, passwordHash }),
      );
      console.log(`  CREATED  ${demo.email}`);
    } else {
      const hasDemoPassword = await bcrypt.compare(DEMO_PASSWORD, user.passwordHash);
      const hasExpectedUsername = user.username === demo.username;

      if (!hasDemoPassword || !hasExpectedUsername) {
        user.passwordHash = passwordHash;
        user.username = demo.username;
        await userRepo.save(user);
        console.log(`  UPDATED  ${demo.email} (password/username synced)`);
      } else {
        console.log(`  SKIP  ${demo.email} (already up to date)`);
      }
    }

    const wallet = await walletRepo.findOne({ where: { userId: user.id } });
    if (!wallet) {
      await walletRepo.save(
        walletRepo.create({
          userId: user.id,
          currencyCode: 'USD',
          availableBalanceCents: 0,
          reservedBalanceCents: 0,
        }),
      );
      console.log(`  CREATED  wallet for ${demo.email}`);
    }
  }

  // Seed demo markets
  console.log('\n--- Seeding demo markets ---');
  for (const demo of DEMO_MARKETS) {
    const existing = await marketRepo.findOne({ where: { slug: demo.slug } });
    if (existing) {
      const closesAtInPast =
        existing.closesAt !== null && existing.closesAt.getTime() <= Date.now();

      if (existing.status === MarketStatus.OPEN && closesAtInPast) {
        existing.closesAt = demo.closesAt;
        await marketRepo.save(existing);
        console.log(`  UPDATED  ${demo.slug} (moved closesAt into the future)`);
      } else {
        console.log(`  SKIP  ${demo.slug} (already exists)`);
      }
      continue;
    }

    const market = marketRepo.create({
      slug: demo.slug,
      title: demo.title,
      status: MarketStatus.OPEN,
      closesAt: demo.closesAt,
    });
    const saved = await marketRepo.save(market);

    await outcomeRepo.save([
      outcomeRepo.create({ market: saved, side: OutcomeSide.YES }),
      outcomeRepo.create({ market: saved, side: OutcomeSide.NO }),
    ]);
    console.log(`  CREATED  ${demo.slug}`);
  }

  await AppDataSource.destroy();
  console.log('\nSeed complete.');
}

seed().catch((err: unknown) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
