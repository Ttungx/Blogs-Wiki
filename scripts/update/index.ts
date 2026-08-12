import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runUpdate } from './runner';
import { writeFailureReport, writeUpdateReport } from './report';
import { DEFAULT_LIMIT_PER_SOURCE } from './constants';

interface CliOptions {
  dryRun: boolean;
  sourceId?: string;
  limit?: number;
  /** 非空时把可审计报告（report.json + report.md）写入该目录。 */
  reportDir?: string;
}

function parseLimit(value: string | undefined): number {
  if (!value || !/^\d+$/.test(value)) {
    throw new Error('--limit requires a non-negative integer (0 = unlimited)');
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error('--limit is outside the supported integer range');
  }
  return parsed;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--source' || arg === '-s' || arg.startsWith('--source=')) {
      if (arg.startsWith('--source=')) {
        options.sourceId = arg.slice('--source='.length);
      } else {
        i += 1;
        options.sourceId = argv[i];
      }
      if (!options.sourceId || options.sourceId.startsWith('-')) {
        throw new Error('--source requires a source id');
      }
    } else if (arg === '--limit' || arg === '-l' || arg.startsWith('--limit=')) {
      if (arg.startsWith('--limit=')) {
        options.limit = parseLimit(arg.slice('--limit='.length));
      } else {
        i += 1;
        options.limit = parseLimit(argv[i]);
      }
    } else if (arg === '--report' || arg.startsWith('--report=')) {
      let value: string | undefined;
      if (arg.startsWith('--report=')) {
        value = arg.slice('--report='.length);
      } else {
        i += 1;
        value = argv[i];
      }
      if (!value || value.startsWith('-')) {
        throw new Error('--report requires a directory path');
      }
      options.reportDir = path.resolve(value);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: npm run update -- [options]

Options:
  --dry-run             Discover and fetch only; do not call the translation
                        model and do not write any files.
  --source <id>         Update a single source by id (default: all sources).
  --limit <n>           Max new articles per source (default: ${DEFAULT_LIMIT_PER_SOURCE}; 0 = unlimited).
  --report <dir>        Write an auditable report (report.json + report.md)
                        to the given directory; also written on fatal errors.
  -h, --help            Show this help.

Environment:
  OPENAI_API_KEY        API key for the OpenAI-compatible endpoint.
  OPENAI_BASE_URL       Base URL, e.g. https://api.openai.com/v1.
  TRANSLATION_MODEL     Model identifier, recorded on each article.
  MODEL_REASONING_EFFORT  Optional (e.g. high); sent as reasoning_effort on chat/completions.
  STORAGE_BACKEND       file (default) or d1; d1 requires an injected Worker binding.`);
      console.log(`  USE_PROXY             Set to "true" to route requests through PROXY_URL.
  PROXY_URL             HTTP proxy, e.g. http://127.0.0.1:7897.`);
      console.log(`  FETCH_BACKEND          node (default) or worker; worker uses Defuddle + linkedom.`);
      process.exit(0);
    }
  }

  return options;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const summary = await runUpdate({
    rootDir,
    dryRun: options.dryRun,
    sourceId: options.sourceId,
    limit: options.limit,
  });
  if (options.reportDir) {
    const { jsonPath, mdPath } = await writeUpdateReport(options.reportDir, {
      dryRun: options.dryRun,
      sourceId: options.sourceId,
      limit: options.limit,
    }, summary);
    console.log(`Report written: ${jsonPath} ${mdPath}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run().catch(async (error) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(`fatal: ${message}`);
    try {
      const options = parseArgs(process.argv.slice(2));
      if (options.reportDir) {
        const { jsonPath, mdPath } = await writeFailureReport(
          options.reportDir,
          error instanceof Error ? error : new Error(String(error)),
        );
        console.error(`Failure report written: ${jsonPath} ${mdPath}`);
      }
    } catch {
      // 报告写入失败不应掩盖原始错误或改变退出码。
    }
    process.exit(1);
  });
}
