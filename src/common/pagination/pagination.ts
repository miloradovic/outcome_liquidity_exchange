export type PaginationParams = {
  limit: number;
  offset: number;
};

export const DEFAULT_PAGINATION: PaginationParams = {
  limit: 100,
  offset: 0,
};

export const MAX_PAGINATION_LIMIT = 200;
