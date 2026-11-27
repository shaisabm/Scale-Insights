import { metrics, within, zeroSales } from "./zero-sales.js";

const asinTerm = /^B0[A-Z0-9]{8}$/i;
export const ALL_TERMS = { name: "All search terms", filters: {}, hideAsins: false, hideKeywords: false, sort: "clicks", dir: "desc", track: [], order: [], showTracked: true };
const counts = rows => {
  const sum = { impressions: 0, clicks: 0, orders: 0, units: 0, cost: 0, sales: 0 };
  for (const row of rows) for (const key of Object.keys(sum)) sum[key] += Number(row[key === "cost" ? "spend" : key] || 0);
  return metrics(sum);
};

/** Products retain their full-period totals; only their nested search terms use the insight filter. */
export async function searchTerms(db, options) {
  const settings = options.settings || ALL_TERMS;
  const all = await zeroSales(db, { ...options, settings: ALL_TERMS, page: 0, pageSize: Number.MAX_SAFE_INTEGER, includeDetails: true });
  const rows = all.rows.filter(r => Object.entries(settings.filters).every(([k, f]) => within(r[k], f))
    && !(settings.hideAsins && asinTerm.test(r.term)) && !(settings.hideKeywords && !asinTerm.test(r.term)));
  rows.sort((a, b) => {
    const x = a[settings.sort], y = b[settings.sort];
    return (x == null || y == null ? Number(x == null) - Number(y == null) : (x - y) * (settings.dir === "asc" ? 1 : -1))
      || a.term.localeCompare(b.term) || a.adProduct.localeCompare(b.adProduct) || a.asin.localeCompare(b.asin);
  });
  const products = new Map();
  for (const r of all.rows) {
    const p = products.get(r.asin) || { asin: r.asin, title: r.title, image: r.image, products: r.products, source: [], terms: [] };
    p.source.push(r);
    products.set(r.asin, p);
  }
  for (const r of rows) products.get(r.asin).terms.push(r);
  const productRows = [...products.values()].filter(p => p.terms.length).map(p => ({ ...p, source: undefined, ...counts(p.source) }));
  return { from: all.from, to: all.to, settings, coverage: all.coverage, rows, products: productRows,
    totals: counts(rows), productTotals: counts(productRows),
    detailComplete: all.rows.every(r => r.details.every(d => d.detailed)) };
}
