/**
 * 文件后端路径常量。
 *
 * 与 scripts/update/persist.ts:11-13 的 CONTENT_DIR / DATA_DIR / PROCESSED_FILE
 * 保持一致，确保 FileRepository 与现有管线读写同一组路径（过渡期并行不冲突）。
 * Phase 10 删除文件后端时，本文件一并移除。
 */

/** 文章 markdown 文件目录：相对仓库根的路径分段。 */
export const CONTENT_DIR = ['src', 'content', 'articles'] as const;

/** 运行时数据目录（processed-urls.json 所在）。 */
export const DATA_DIR = ['src', 'data'] as const;

/** 处理状态文件名。 */
export const PROCESSED_FILE = 'processed-urls.json';

/** processed-urls.json 的 JSON 缩进空格数（对齐 persist.ts:48 的 2 空格）。 */
export const JSON_INDENT = 2;
