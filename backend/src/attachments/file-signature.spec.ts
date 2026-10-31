import { detectFile, extensionMatches, sanitiseFileName } from './file-signature';

const pdf = Buffer.from('%PDF-1.7\n%âãÏÓ');
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)]);
const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);

describe('detectFile', () => {
  it('detects PDF, PNG and JPEG by content', () => {
    expect(detectFile(pdf, 'a.pdf')?.mime).toBe('application/pdf');
    expect(detectFile(png, 'a.png')?.mime).toBe('image/png');
    expect(detectFile(jpg, 'a.jpg')?.mime).toBe('image/jpeg');
  });

  it('accepts a text CSV only when the extension is .csv', () => {
    const csv = Buffer.from('a,b\n1,2\n');
    expect(detectFile(csv, 'data.csv')?.mime).toBe('text/csv');
    expect(detectFile(csv, 'data.txt')).toBeNull();
  });

  it('rejects executables and binary data disguised as CSV', () => {
    expect(detectFile(Buffer.from('MZ\x90\x00\x03\x00'), 'evil.csv')).toBeNull();
    expect(detectFile(Buffer.from('<script>alert(1)</script>'), 'x.html')).toBeNull();
  });
});

describe('extensionMatches', () => {
  it('rejects a PNG renamed to .pdf', () => {
    expect(extensionMatches('photo.pdf', detectFile(png, 'photo.pdf')!)).toBe(false);
  });
  it('accepts .jpeg for JPEG content', () => {
    expect(extensionMatches('photo.jpeg', detectFile(jpg, 'photo.jpeg')!)).toBe(true);
  });
});

describe('sanitiseFileName', () => {
  it('removes path traversal and odd characters', () => {
    expect(sanitiseFileName('../../etc/pass"wd.pdf')).toBe('pass_wd.pdf');
    expect(sanitiseFileName('')).toBe('file');
  });
});
