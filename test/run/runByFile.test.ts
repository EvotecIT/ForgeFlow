import { strict as assert } from 'assert';
import { quoteShellArg, renderCommandTemplate } from '../../src/run/runByFile';

describe('run-by-file helpers', () => {
  it('quotes shell args with spaces and quotes', () => {
    assert.equal(quoteShellArg('C:\\Temp\\My File.cs'), '"C:\\Temp\\My File.cs"');
    assert.equal(quoteShellArg('C:\\Temp\\A\"B.cs'), '"C:\\Temp\\A\\\"B.cs"');
  });

  it('renders command template with quoted tokens', () => {
    const output = renderCommandTemplate('dotnet run {file} --project {project}', {
      file: 'C:\\Temp\\File.cs',
      project: 'C:\\Temp\\App.csproj',
      projectDir: 'C:\\Temp'
    });
    assert.equal(output, 'dotnet run "C:\\Temp\\File.cs" --project "C:\\Temp\\App.csproj"');
  });

  it('renders command template with empty values', () => {
    const output = renderCommandTemplate('dotnet run {file}', {
      file: '',
      project: '',
      projectDir: ''
    });
    assert.equal(output, 'dotnet run ""');
  });
});
