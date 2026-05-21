import path from "node:path";
import { loadGame } from "../loader";
import {
  formatReport,
  loadFixtures,
  runFixture,
  summarize,
} from "../test/runner";

interface Args {
  gameDir: string;
}

export async function testCommand(args: Args): Promise<void> {
  const game = await loadGame(args.gameDir);
  const testsDir = path.join(args.gameDir, "tests");
  const fixtures = await loadFixtures(testsDir);
  if (fixtures.length === 0) {
    process.stderr.write(`No fixtures found under ${testsDir}\n`);
    return;
  }
  const results = await Promise.all(
    fixtures.map(({ file, fixture }) => runFixture(game, fixture, file)),
  );
  const report = summarize(results);
  process.stdout.write(formatReport(report) + "\n");
  if (report.failed > 0 || report.errored > 0) {
    process.exit(1);
  }
}
