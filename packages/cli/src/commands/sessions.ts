import { listSessions } from "../session";

interface Args {
  gameDir: string;
}

export async function sessionsCommand(args: Args): Promise<void> {
  const names = await listSessions(args.gameDir);
  if (names.length === 0) {
    process.stderr.write("(no sessions)\n");
    return;
  }
  for (const n of names) process.stdout.write(n + "\n");
}
