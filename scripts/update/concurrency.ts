/**
 * 运维脚本共享的小工具 —— backfill 与 batch-translate 的同构逻辑
 * （历史上是两份逐字复制，收敛于此）。
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** 固定并发数依序消费 items；item 级失败由 worker 自行捕获，不中断整批。 */
export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

/**
 * 把本次运行追加进错误台账（保留历史），而非整体覆盖。
 * 文件不存在时以 header 起头（各脚本自定义标题）。
 */
export async function appendErrorLedger(
  rootDir: string,
  errorLog: string,
  header: string,
  section: string,
): Promise<void> {
  const file = path.resolve(rootDir, errorLog);
  await fs.mkdir(path.dirname(file), { recursive: true });
  let existing = '';
  try {
    existing = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const prefix = existing ? '' : header;
  await fs.writeFile(file, `${prefix}${existing ? `${existing.replace(/\s+$/, '')}\n\n---\n\n` : ''}${section}`, 'utf8');
}
