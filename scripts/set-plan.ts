// Operator command: change an organization's plan.
//   npm run plan:set -- <org id or exact name> <FREE|STARTER|GROWTH|BUSINESS>
import { Plan, PrismaClient } from '@prisma/client';

async function main() {
  const [orgRef, planArg] = process.argv.slice(2);
  const plan = planArg?.toUpperCase() as Plan;
  if (!orgRef || !Object.values(Plan).includes(plan)) {
    console.error(`Usage: npm run plan:set -- <org id or name> <${Object.values(Plan).join('|')}>`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const matches = await prisma.organization.findMany({ where: { OR: [{ id: orgRef }, { name: orgRef }] } });
    if (matches.length !== 1) {
      console.error(matches.length ? `"${orgRef}" matches ${matches.length} organizations; use the id.` : `No organization "${orgRef}".`);
      process.exit(1);
    }
    const previous = matches[0].plan;
    const org = await prisma.organization.update({ where: { id: matches[0].id }, data: { plan, customMonthlyQuota: null } });
    // Operator action: no user actor.
    await prisma.auditEvent.create({ data: { orgId: org.id, action: 'plan.changed', target: plan, metadata: { from: previous } } });
    console.log(`${org.name} (${org.id}) is now on ${org.plan} (was ${previous}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
