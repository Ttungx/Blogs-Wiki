/**
 * 受控分类集合（worker 内部统一引用入口）。
 *
 * 真相源仍是 `src/config/categories.ts`（站点层与管线层共用）。
 * 这里 re-export，让 worker/ 模块 import 路径稳定，避免未来改动站点层路径时
 * 散落在多个 worker 文件里的引用都要改。
 */
export { CATEGORIES, CATEGORY_OPTIONS } from '../../src/config/categories';
