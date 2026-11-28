import { createClient } from "@libsql/client";
import { describe, expect, it, vi } from "vitest";
import { migrate } from "../../server/db.js";
import { addKeywordStates, refreshKeywordStates } from "../../server/ads/keyword-states.js";

const entity = (state, id = '1') => ({ campaignId: 'campaign', adGroupId: 'group', keywordId: id, state });
describe('keyword states', () => {
  it('reads all pages and all states, preserves identity and supports SP targets and SB keywords', async () => {
    const db = await migrate(createClient({ url: ':memory:' }));
    const ads = { request: vi.fn(async (method, path, options) => {
      if (path === '/sp/keywords/list') {
        expect(method).toBe('POST');
        expect(options.body.stateFilter.include).toEqual(['ENABLED', 'PAUSED', 'ARCHIVED']);
        return { status: 200, data: options.body.nextToken ? { keywords: [entity('ARCHIVED', '2')] } : { keywords: [entity('ENABLED')], nextToken: 'next' } };
      }
      if (path === '/sp/targets/list') return { status: 200, data: { targetingClauses: [{ ...entity('PAUSED'), targetId: '3' }] } };
      expect(method).toBe('GET');
      if (path.startsWith('/sd/targets?')) return { status: 200, data: [{ campaignId: 'campaign', adGroupId: 'group', targetId: '7', state: 'paused', bid: 0.32 }] };
      return { status: 200, data: path.includes('startIndex=0') ? Array.from({ length: 100 }, (_, i) => entity('enabled', String(i))) : [entity('paused', '100')] };
    }) };
    expect(await refreshKeywordStates(db, ads, 'profile')).toEqual([]);
    const details = ['1', '2', '3', 'missing'].map(keywordId => ({ campaignId: 'campaign', adGroupId: 'group', keywordId }));
    const rows = [{ adProduct: 'SP_SEARCH', details }, { adProduct: 'SB_SEARCH', details: [{ ...details[0], keywordId: '100' }] }];
    await addKeywordStates(db, 'profile', rows);
    expect(details.map(d => d.state)).toEqual(['enabled', 'archived', 'paused', 'unknown']);
    expect(rows[1].details[0].state).toBe('paused');
    await addKeywordStates(db, 'other-profile', rows);
    expect(details.every(d => d.state === 'unknown')).toBe(true);
    // Sponsored Display targets are kept under their ad type, and each entity's bid alongside.
    expect((await db.execute("SELECT state FROM ads_keyword_states WHERE ad_product = 'SD' AND keyword_id = '7'")).rows[0].state).toBe('paused');
    expect((await db.execute("SELECT ad_product, keyword_id, bid FROM ads_keyword_bids WHERE ad_product IN ('SP_SEARCH', 'SD') AND keyword_id IN ('1', '7') ORDER BY keyword_id")).rows.map(r => ({ ...r })))
      .toEqual([{ ad_product: 'SP_SEARCH', keyword_id: '1', bid: null }, { ad_product: 'SD', keyword_id: '7', bid: 0.32 }]);
  });

  it('keeps each bid, null when the ad group default applies, and lists Sponsored Display targets only for their report', async () => {
    const db = await migrate(createClient({ url: ':memory:' }));
    const paths = [];
    const ads = { request: vi.fn(async (method, path) => {
      paths.push(path.split('?')[0]);
      if (path === '/sp/keywords/list') return { status: 200, data: { keywords: [{ ...entity('ENABLED'), bid: 1.85 }] } };
      if (path === '/sp/targets/list') return { status: 200, data: { targetingClauses: [{ ...entity('ENABLED'), targetId: '2' }] } };
      return { status: 200, data: [] };
    }) };
    expect(await refreshKeywordStates(db, ads, 'profile', { products: ['SP_SEARCH', 'SB_SEARCH'] })).toEqual([]);
    expect(paths).not.toContain('/sd/targets');
    expect((await db.execute("SELECT keyword_id, bid FROM ads_keyword_bids ORDER BY keyword_id")).rows.map(r => ({ ...r }))).toEqual([{ keyword_id: '1', bid: 1.85 }, { keyword_id: '2', bid: null }]);
    await refreshKeywordStates(db, ads, 'profile', { products: ['SD_TARGETING'] });
    expect(paths).toContain('/sd/targets');
  });

  it('keeps the last successful snapshot on failure and removes entities absent from a successful refresh', async () => {
    const db = await migrate(createClient({ url: ':memory:' }));
    await db.execute("INSERT INTO ads_keyword_states VALUES ('profile','SP_SEARCH','keyword','campaign','group','1','paused','old')");
    const errors = await refreshKeywordStates(db, { request: async () => ({ status: 429 }) }, 'profile');
    expect(errors).toHaveLength(4);
    expect((await db.execute('SELECT state FROM ads_keyword_states')).rows[0].state).toBe('paused');
    await refreshKeywordStates(db, { request: async (method, path) => ({ status: 200, data: path === '/sp/keywords/list' ? { keywords: [] } : path === '/sp/targets/list' ? { targetingClauses: [] } : [] }) }, 'profile');
    expect((await db.execute('SELECT * FROM ads_keyword_states')).rows).toEqual([]);
  });

  it('gives each source its own timeout and only replaces sources that finish', async () => {
    const db = await migrate(createClient({ url: ':memory:' }));
    await db.batch([
      "INSERT INTO ads_keyword_states VALUES ('profile','SP_SEARCH','keyword','campaign','group','1','paused','old')",
      "INSERT INTO ads_keyword_states VALUES ('profile','SP_SEARCH','target','campaign','group','2','paused','old')",
      "INSERT INTO ads_keyword_states VALUES ('profile','SB_SEARCH','keyword','campaign','group','3','paused','old')",
    ], "write");
    let timeoutCount = 0;
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(() =>
      timeoutCount++ === 0 ? AbortSignal.abort(new DOMException("timed out", "TimeoutError")) : new AbortController().signal);
    const signals = [];
    try {
      const errors = await refreshKeywordStates(db, { request: async (method, path, options) => {
        signals.push(options.signal);
        if (options.signal.aborted) throw options.signal.reason;
        return { status: 200, data: path === '/sp/keywords/list' ? { keywords: [] } : path === '/sp/targets/list' ? { targetingClauses: [] } : [] };
      } }, 'profile');
      expect(errors).toEqual(["SP_SEARCH keyword state: timed out"]);
      expect(timeout).toHaveBeenCalledTimes(4);
      expect(new Set(signals).size).toBe(4);
      expect((await db.execute("SELECT ad_product, kind FROM ads_keyword_states")).rows)
        .toEqual([{ ad_product: "SP_SEARCH", kind: "keyword" }]);
    } finally {
      timeout.mockRestore();
    }
  });
});
