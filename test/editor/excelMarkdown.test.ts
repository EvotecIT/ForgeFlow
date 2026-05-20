import { strict as assert } from 'assert';
import { excelToMarkdown } from '../../src/editor/excelMarkdown';

describe('excel markdown conversion', () => {
  it('converts clipboard TSV to a markdown table', () => {
    assert.equal(
      excelToMarkdown('one\ttwo\r\nthree'),
      '| one   | two |\n|-------|-----|\n| three |     |'
    );
  });

  it('supports header alignment markers', () => {
    assert.equal(excelToMarkdown('^rtest'), '| test |\n|-----:|');
    assert.equal(excelToMarkdown('^ctest'), '| test |\n|:----:|');
    assert.equal(excelToMarkdown('^ltest'), '| test |\n|------|');
  });

  it('escapes markdown pipes and preserves intra-cell newlines', () => {
    assert.equal(
      excelToMarkdown('name\tvalue\r\na|b\t"line1\nline2"'),
      '| name | value           |\n|------|-----------------|\n| a\\|b | line1<br/>line2 |'
    );
  });

  it('parses quoted TSV fields before splitting columns', () => {
    assert.equal(
      excelToMarkdown('name\tvalue\r\n"a\tb"\tc'),
      '| name | value |\n|------|-------|\n| a\tb  | c     |'
    );
  });

  it('preserves boundary spaces in first and last cells', () => {
    assert.equal(
      excelToMarkdown('  first\tlast  \r\n'),
      '|   first | last   |\n|---------|--------|'
    );
  });

  it('unquotes normal quoted cells and doubled quote escapes', () => {
    assert.equal(
      excelToMarkdown('quote\r\n"He said ""hi"""'),
      '| quote        |\n|--------------|\n| He said "hi" |'
    );
  });
});
