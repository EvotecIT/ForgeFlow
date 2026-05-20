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
});
