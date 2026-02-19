// synth tui command
import { SynthTUI } from '../../tui/index.js';
import type { TUIConfig } from '../../tui/index.js';

export async function handleTui(args: string[]): Promise<void> {
  const config: TUIConfig = {
    workspace: process.cwd(),
    session: undefined,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--workspace' && i + 1 < args.length) {
      config.workspace = args[i + 1];
      i++;
    } else if (arg === '--session' && i + 1 < args.length) {
      config.session = args[i + 1];
      i++;
    }
  }

  const tui = new SynthTUI(config);
  await tui.init();
  tui.start();
}
