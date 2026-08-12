import { type CheckpointListOptions, DEFAULT_CHECKPOINT_LIST_LIMIT } from "@tokenring-ai/checkpoint/AgentCheckpointStorage";

export type NormalizedListOptions = {
  sessionId?: string;
  agentId?: string;
  agentType?: string;
  limit: number;
  offset: number;
  before?: number;
  after?: number;
  orderBy: "createdAt" | "id";
  orderDir: "ASC" | "DESC";
};

export function normalizeListOptions(options?: CheckpointListOptions): NormalizedListOptions {
  const normalized: NormalizedListOptions = {
    limit: options?.limit ?? DEFAULT_CHECKPOINT_LIST_LIMIT,
    offset: options?.offset ?? 0,
    orderBy: options?.orderBy ?? "createdAt",
    orderDir: options?.orderDir ?? "DESC",
  };
  if (options?.sessionId != null) normalized.sessionId = options.sessionId;
  if (options?.agentId != null) normalized.agentId = options.agentId;
  if (options?.agentType != null) normalized.agentType = options.agentType;
  if (options?.before != null) normalized.before = options.before;
  if (options?.after != null) normalized.after = options.after;
  return normalized;
}

export type PlaceholderStyle = "dollar" | "question";

function nextPlaceholder(style: PlaceholderStyle, index: number): string {
  return style === "dollar" ? `$${index}` : "?";
}

export type BuiltListQuery = {
  whereSql: string;
  params: unknown[];
  orderSql: string;
  limitSql: string;
  limitParams: unknown[];
};

/**
 * Build a parameterized WHERE/ORDER/LIMIT clause for checkpoint list queries.
 * Column names are fixed (not user-controlled) to avoid SQL injection.
 */
export function buildListFilters(
  style: PlaceholderStyle,
  options: NormalizedListOptions,
  quote: (ident: string) => string,
  filters: {
    sessionId?: boolean;
    agentId?: boolean;
    agentType?: boolean;
  } = { sessionId: true, agentId: true, agentType: true },
): BuiltListQuery {
  const clauses: string[] = [];
  const params: unknown[] = [];
  let i = 1;

  if (filters.sessionId && options.sessionId != null) {
    clauses.push(`${quote("sessionId")} = ${nextPlaceholder(style, i++)}`);
    params.push(options.sessionId);
  }
  if (filters.agentId && options.agentId != null) {
    clauses.push(`${quote("agentId")} = ${nextPlaceholder(style, i++)}`);
    params.push(options.agentId);
  }
  if (filters.agentType && options.agentType != null) {
    clauses.push(`${quote("agentType")} = ${nextPlaceholder(style, i++)}`);
    params.push(options.agentType);
  }
  if (options.before != null) {
    clauses.push(`${quote("createdAt")} < ${nextPlaceholder(style, i++)}`);
    params.push(options.before);
  }
  if (options.after != null) {
    clauses.push(`${quote("createdAt")} > ${nextPlaceholder(style, i++)}`);
    params.push(options.after);
  }

  const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderCol = options.orderBy === "id" ? quote("id") : quote("createdAt");
  const orderSql = `ORDER BY ${orderCol} ${options.orderDir}`;
  const limitSql = `LIMIT ${nextPlaceholder(style, i)} OFFSET ${nextPlaceholder(style, i + 1)}`;
  const limitParams = [options.limit, options.offset];

  return { whereSql, params, orderSql, limitSql, limitParams };
}
