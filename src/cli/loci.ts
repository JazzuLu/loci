#!/usr/bin/env node

import { remember } from "../commands/remember.js";
import { recall } from "../commands/recall.js";
import { sync } from "../commands/sync.js";
import { status } from "../commands/status.js";

const commands = ["remember", "recall", "sync", "status"] as const;
type Command = (typeof commands)[number];

function usage(): void {
  console.log(`loci — cross-tool memory plane

Usage: loci <command> [options]

Commands:
  remember   Store a memory (route to appropriate target)
  recall     Retrieve memories by query
  sync       Sync external memory sources into the index
  status     Show adapter status and index diagnostics
`);
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  if (!commands.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  switch (command as Command) {
    case "remember":
      await remember(rest);
      break;
    case "recall":
      await recall(rest);
      break;
    case "sync":
      await sync(rest);
      break;
    case "status":
      await status();
      break;
  }
}

main().catch((err: unknown) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
