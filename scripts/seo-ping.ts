/**
 * Pings IndexNow with all sitemap URLs.
 * Reaches Bing, Yandex, Naver, Seznam, DuckDuckGo via the IndexNow protocol.
 */

const HOST = 'gynat.com';
const KEY = 'dc3b8360bea04bd18cdba72cd06ee11c';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const SITEMAP_URL = `https://${HOST}/sitemap.xml`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(SITEMAP_URL);
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`);
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
  if (urls.length === 0) throw new Error('No <loc> entries found in sitemap');
  return urls;
}

async function pingIndexNow(urls: string[]): Promise<void> {
  const body = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: urls,
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  console.log(`IndexNow status: ${res.status} ${res.statusText}`);
  if (text) console.log(`Response body: ${text}`);

  // 200 = accepted, 202 = accepted (validation pending), others = error
  if (res.status !== 200 && res.status !== 202) {
    throw new Error(`IndexNow rejected ping (status ${res.status})`);
  }
}

async function main() {
  console.log(`Fetching ${SITEMAP_URL}...`);
  const urls = await fetchSitemapUrls();
  console.log(`Found ${urls.length} URLs:`);
  urls.forEach((u) => console.log(`  - ${u}`));
  console.log(`\nPinging IndexNow (key: ${KEY})...`);
  await pingIndexNow(urls);
  console.log('\nDone. Bing, Yandex, Naver, Seznam will crawl within hours.');
}

main().catch((err) => {
  console.error('IndexNow ping failed:', err);
  process.exit(1);
});
