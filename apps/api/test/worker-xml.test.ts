import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

import '../src/storage/worker-xml.ts';

const require = createRequire(new URL('../package.json', import.meta.url));
const clientPackage = require.resolve('@aws-sdk/client-s3/package.json');
const resolveFromClient = createRequire(clientPackage);

const list = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>bucket</Name>
  <IsTruncated>false</IsTruncated>
  <Contents><Key>img/abc.jpeg</Key><Size>12</Size></Contents>
</ListBucketResult>`;

describe('worker xml parser', () => {
	it('reads an R2 list the way the browser AWS parser does', async () => {
		const parser = resolveFromClient.resolve('@aws-sdk/xml-builder/dist-es/xml-parser.browser.js');
		const { parseXML } = (await import(parser)) as {
			parseXML: (xml: string) => { ListBucketResult: { Contents: { Key: string } } };
		};
		expect(parseXML(list).ListBucketResult.Contents.Key).toBe('img/abc.jpeg');
	});
});
