#!/usr/bin/env node

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

function main(): void {
  const [command] = process.argv.slice(2);

  if (!command || command === "--help" || command === "-h") {
    usage();
    process.exit(0);
  }

  if (!commands.includes(command as Command)) {
    console.error(`Unknown command: ${command}`);
    usage();
    process.exit(1);
  }

  // Commands will be wired in Chunk 4
  console.log(`loci ${command}: not yet implemented`);
}

main();
