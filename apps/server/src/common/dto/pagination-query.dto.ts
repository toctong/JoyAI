import { Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";

/** Coerce query-string booleans (`true`/`false`/`1`/`0`). */
export function toOptionalBoolean({ value }: { value: unknown }) {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 12;

  @IsOptional()
  @IsString()
  keyword?: string;
}

export type PaginatedResult<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function normalizePage(page?: number, pageSize?: number) {
  const p = Math.max(1, page ?? 1);
  const size = Math.min(100, Math.max(1, pageSize ?? 12));
  return { page: p, pageSize: size, skip: (p - 1) * size };
}
