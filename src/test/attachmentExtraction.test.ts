import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { prepareAttachmentExtraction } from '@/lib/attachmentExtraction';

function zippedFile(name: string, entries: Record<string, string>) {
  const zipped = zipSync(Object.fromEntries(Object.entries(entries).map(([path, value]) => [path, strToU8(value)])));
  return new File([zipped], name, { type: 'application/zip' });
}

describe('browser-native attachment extraction', () => {
  it('extracts bounded text and a checksum without uploading content elsewhere', async () => {
    const result = await prepareAttachmentExtraction(new File(['hello\r\nworld'], 'notes.txt', { type: 'text/plain' }));
    expect(result.extracted_text).toBe('hello\nworld');
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(result.derivatives?.[0]?.label).toBe('Browser text extraction');
  });

  it('extracts DOCX paragraphs with a document boundary', async () => {
    const file = zippedFile('brief.docx', {
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>First point</w:t></w:r></w:p><w:p><w:r><w:t>Second point</w:t></w:r></w:p></w:body></w:document>',
    });
    const result = await prepareAttachmentExtraction(file);
    expect(result.extracted_text).toContain('[Document]');
    expect(result.extracted_text).toContain('First point');
    expect(result.extracted_text).toContain('Second point');
  });

  it('preserves PPTX slide boundaries', async () => {
    const file = zippedFile('deck.pptx', {
      '[Content_Types].xml': '<Types/>',
      'ppt/slides/slide2.xml': '<p:sld><a:p><a:r><a:t>Second slide</a:t></a:r></a:p></p:sld>',
      'ppt/slides/slide1.xml': '<p:sld><a:p><a:r><a:t>Opening slide</a:t></a:r></a:p></p:sld>',
    });
    const result = await prepareAttachmentExtraction(file);
    expect(result.extracted_text).toMatch(/\[Slide 1\][\s\S]*Opening slide[\s\S]*\[Slide 2\][\s\S]*Second slide/);
  });

  it('extracts XLSX rows with sheet names', async () => {
    const file = zippedFile('table.xlsx', {
      '[Content_Types].xml': '<Types/>',
      'xl/workbook.xml': '<workbook><sheets><sheet name="Budget" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/sharedStrings.xml': '<sst><si><t>Item</t></si><si><t>Cost</t></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>Hosting</v></c><c r="B2"><v>42</v></c></row></sheetData></worksheet>',
    });
    const result = await prepareAttachmentExtraction(file);
    expect(result.extracted_text).toContain('[Sheet Budget]');
    expect(result.extracted_text).toContain('Item\tCost');
    expect(result.extracted_text).toContain('Hosting\t42');
  });

  it('rejects nested archives before decompression', async () => {
    const file = zippedFile('bundle.zip', { 'nested.zip': 'not really a zip' });
    await expect(prepareAttachmentExtraction(file)).rejects.toThrow('Nested archives are not supported');
  });
});
