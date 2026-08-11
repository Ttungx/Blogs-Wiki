import type {
  DiscoverSourceItemInput,
  SourceItemRecord,
  SourceItemStatus,
} from '../domain/types';

export interface SourceItemRepository {
  /** 幂等记录发现结果；已发布/跳过条目不会被重新打开。 */
  discover(input: DiscoverSourceItemInput): Promise<SourceItemRecord>;
  getById(id: number): Promise<SourceItemRecord | null>;
  listBySource(sourceId: string, statuses?: SourceItemStatus[]): Promise<SourceItemRecord[]>;
  transition(
    id: number,
    status: SourceItemStatus,
    options?: { articleId?: string },
  ): Promise<SourceItemRecord>;
  /** 记录一次失败并递增 attempt_count。 */
  recordFailure(id: number, error: string): Promise<SourceItemRecord>;
}
