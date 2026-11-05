// Test cases for prisma-raw-unsafe.yml (run with: semgrep --test .semgrep)
declare const tx: any;
declare const userInput: string;

async function examples() {
  // ruleid: nasj-prisma-raw-unsafe
  await tx.$queryRawUnsafe(`SELECT * FROM "User" WHERE email = '${userInput}'`);
  // ruleid: nasj-prisma-raw-unsafe
  await tx.$executeRawUnsafe('DELETE FROM "User" WHERE id = ' + userInput);
  const sql = `SELECT ${userInput}`;
  // ruleid: nasj-prisma-raw-unsafe
  await tx.$queryRawUnsafe(sql);

  // ok: nasj-prisma-raw-unsafe
  await tx.$executeRawUnsafe('SAVEPOINT local_consumer');
  // ok: nasj-prisma-raw-unsafe
  await tx.$queryRaw`SELECT * FROM "User" WHERE email = ${userInput}`;
}
