/**
 * Memory Command
 * Manages CoreMemories from CLI
 */

import { CoreMemories } from '../../memory/core-memories.js';
import { loadConfig } from '../setup.js';

export async function runMemoryCommand(action?: string, args: string[] = []): Promise<void> {
  const config = await loadConfig();
  const baseDir = config?.baseDir || '.synth';

  const memories = new CoreMemories({ baseDir: `${baseDir}/core-memories` });
  await memories.initialize();

  switch (action) {
    case 'stats':
      await showStats(memories);
      break;

    case 'search':
      const query = args.join(' ');
      if (!query) {
        console.log('Usage: synth memory search <keyword>');
        return;
      }
      await searchMemories(memories, query);
      break;

    case 'maintenance':
      await runMaintenance(memories);
      break;

    case 'help':
    default:
      showMemoryHelp();
      break;
  }
}

async function showStats(memories: CoreMemories): Promise<void> {
  const stats = await memories.getStats();

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    MEMORY STATISTICS                         ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  console.log('Layer Distribution:');
  console.log(`  Flash:   ${stats.flashCount.toString().padStart(6)} entries (0-48 hours)`);
  console.log(`  Warm:    ${stats.warmCount.toString().padStart(6)} entries (2-7 days)`);
  console.log(`  Recent:  ${stats.recentCount.toString().padStart(6)} entries (7-48 days)`);
  console.log(`  Archive: ${stats.archiveCount.toString().padStart(6)} entries (1-12 months)`);
  console.log(`  Core:    ${stats.coreCount.toString().padStart(6)} entries (1+ years)`);
  console.log('  ' + '─'.repeat(50));
  const total = stats.flashCount + stats.warmCount + stats.recentCount + stats.archiveCount + stats.coreCount;
  console.log(`  Total:   ${total.toString().padStart(6)} entries`);

  console.log('\n═══════════════════════════════════════════════════════════════');
}

async function searchMemories(memories: CoreMemories, query: string): Promise<void> {
  console.log(`Searching memories for "${query}"...\n`);

  const results = await memories.searchByKeyword(query);

  console.log(`Found ${results.totalFound} memories\n`);

  const allEntries = [
    ...results.flash,
    ...results.warm,
    ...results.recent,
    ...results.archive,
    ...results.core
  ] as any[];

  if (allEntries.length === 0) {
    console.log('No memories found.');
    return;
  }

  for (const entry of allEntries.slice(0, 10)) {
    const date = new Date(entry.timestamp).toLocaleString();
    const contentText = entry.content || entry.summary || entry.essence || '';
    const typeLabel = entry.type || entry.category || 'memory';
    const preview = contentText.length > 60
      ? contentText.slice(0, 60) + '...'
      : contentText;

    console.log(`[${date}] ${typeLabel}`);
    console.log(`  ${preview}`);
    console.log(`  Keywords: ${entry.keywords.slice(0, 5).join(', ')}`);
    console.log();
  }

  if (results.totalFound > 10) {
    console.log(`... and ${results.totalFound - 10} more entries`);
  }
}

async function runMaintenance(memories: CoreMemories): Promise<void> {
  console.log('Running memory maintenance...\n');

  const beforeStats = await memories.getStats();
  console.log('Before:');
  console.log(`  Flash: ${beforeStats.flashCount}, Warm: ${beforeStats.warmCount}, Recent: ${beforeStats.recentCount}`);

  const result = await memories.runMaintenance();

  const afterStats = await memories.getStats();
  console.log('\nAfter:');
  console.log(`  Flash: ${afterStats.flashCount}, Warm: ${afterStats.warmCount}, Recent: ${afterStats.recentCount}`);

  console.log('\nMaintenance Results:');
  console.log(`  Compressed:   ${result.compressed} entries`);
  console.log(`  Consolidated: ${result.consolidated} entries`);
  console.log(`  Expired:      ${result.decayed} entries`);

  console.log('\n✓ Maintenance complete');
}

function showMemoryHelp(): void {
  console.log(`
Memory Management Commands:

  synth memory stats        Show memory statistics
  synth memory search <q>   Search memories by keyword
  synth memory maintenance  Run compression and cleanup

Examples:
  synth memory stats
  synth memory search "neural networks"
  synth memory maintenance
`);
}

