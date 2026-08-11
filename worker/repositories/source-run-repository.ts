import type {
  CreateSourceRunInput,
  SourceRunRecord,
  UpdateSourceRunInput,
} from '../domain/types';

export interface SourceRunRepository {
  create(input: CreateSourceRunInput): Promise<SourceRunRecord>;
  getById(id: number): Promise<SourceRunRecord | null>;
  update(id: number, input: UpdateSourceRunInput): Promise<SourceRunRecord>;
}
