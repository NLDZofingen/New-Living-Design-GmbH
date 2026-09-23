import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = mkdtempSync(path.join(tmpdir(), 'badplaner-tests-'));
try {
  const compile = spawnSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.badplaner.json', '--noEmit', 'false', '--outDir', output], { cwd: root, stdio: 'inherit' });
  if (compile.status !== 0) process.exitCode = compile.status || 1;
  else {
    writeFileSync(path.join(output, 'package.json'), '{"type":"module"}\n');
    const directory = path.join(root, 'tests/badplaner');
    const tests = readdirSync(directory).filter((name) => name.endsWith('.test.mjs')).sort().map((name) => path.join(directory, name));
    const result = spawnSync(process.execPath, ['--test', ...tests], {
      cwd: root, stdio: 'inherit', env: { ...process.env, BADPLANER_TEST_BUILD: output },
    });
    process.exitCode = result.status || (result.error ? 1 : 0);
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
