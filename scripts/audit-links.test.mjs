import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { extractHrefs, findDeadLinks, internalPath } from './audit-links.mjs';

describe('extractHrefs', () => {
  it('reads only the href of an <a>, and skips an <a> without one', () => {
    const html = '<link href="/a.css"><a class="x" href="/one/">1</a><a role="link" tabindex="0">2</a><a href="/q?a=1&amp;b=2">3</a>';
    expect(extractHrefs(html)).toEqual(['/one/', '/q?a=1&b=2']);
  });
});

describe('internalPath', () => {
  it('keeps site links, without their query, and drops everything else', () => {
    expect(internalPath('/suche/?q=x')).toBe('/suche/');
    expect(internalPath('https://politblick.de/daten/')).toBe('/daten/');
    expect(internalPath('https://www.bundestag.de/x')).toBeNull();
    expect(internalPath('mailto:a@b.de')).toBeNull();
    expect(internalPath('#top')).toBeNull();
  });
});

describe('findDeadLinks', () => {
  const dist = mkdtempSync(join(tmpdir(), 'audit-links-'));
  afterAll(() => rmSync(dist, { recursive: true, force: true }));

  it('finds a link without a built page, and accepts files, both URL forms and encoded paths', () => {
    mkdirSync(join(dist, 'parteien/CDU/CSU'), { recursive: true });
    writeFileSync(join(dist, 'parteien/CDU/CSU/index.html'), '');
    writeFileSync(join(dist, 'feed.xml'), '');
    writeFileSync(
      join(dist, 'index.html'),
      '<a href="/parteien/CDU%2FCSU/">a</a><a href="/parteien/CDU%2FCSU">b</a><a href="/feed.xml">c</a><a href="/abgeordnete/1/stimmen/">d</a>',
    );
    const { dead, pageCount } = findDeadLinks(dist);
    expect(pageCount).toBe(2);
    expect([...dead.keys()]).toEqual(['/abgeordnete/1/stimmen/']);
    expect([...dead.get('/abgeordnete/1/stimmen/')]).toEqual(['/']);
  });
});
