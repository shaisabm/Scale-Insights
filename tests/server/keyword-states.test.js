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
  });

  it('keeps the last successful snapshot on failure and removes entities absent from a successful refresh', async () => {
    const db = await migrate(createClient({ url: ':memory:' }));
    await db.execute("INSERT INTO ads_keyword_states VALUES ('profile','SP_SEARCH','keyword','campaign','group','1','paused','old')");
    const errors = await refreshKeywordStates(db, { request: async () => ({ status: 429 }) }, 'profile');
    expect(errors).toHaveLength(3);
    expect((await db.execute('SELECT state FROM ads_keyword_states')).rows[0].state).toBe('paused');
    await refreshKeywordStates(db, { request: async (method, path) => ({ status: 200, data: path === '/sp/keywords/list' ? { keywords: [] } : path === '/sp/targets/list' ? { targetingClauses: [] } : [] }) }, 'profile');
    expect((await db.execute('SELECT * FROM ads_keyword_states')).rows).toEqual([]);
  });
});
