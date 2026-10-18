export function pagination(query = {}) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 50);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw Object.assign(new Error('Trang phải từ 1 trở lên; mỗi trang từ 1 đến 100 mục.'), { status: 400 });
  }
  return { page, limit, offset: (page - 1) * limit };
}
export function pageResult(rows, paging, key) {
  return { [key]: rows.slice(0, paging.limit), page: paging.page, limit: paging.limit, hasMore: rows.length > paging.limit };
}
