import { neutraliseFormula } from './incident-export.service';

describe('neutraliseFormula', () => {
  it.each(['=SUM(A1)', '+1+1', '-2+3', '@cmd', '\tcmd'])('prefixes %j', (value) => {
    expect(neutraliseFormula(value)).toBe(`'${value}`);
  });

  it('leaves ordinary text untouched', () => {
    expect(neutraliseFormula('Printer is offline')).toBe('Printer is offline');
    expect(neutraliseFormula('INC-2026-000001')).toBe('INC-2026-000001');
  });
});
