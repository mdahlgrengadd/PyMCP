import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const proj = path.resolve(process.cwd());
const py = spawnSync('python', ['tools_dump.py'], { cwd: proj, encoding: 'utf8' });
if (py.status !== 0) {
  console.error(py.stderr || 'Failed to run tools_dump.py (is Python available?)');
  process.exit(1);
}

const { tools } = JSON.parse(py.stdout);

const toTs = (schema) => {
  if (!schema) return 'void';
  // Try unwrap single-field result models
  if (schema.properties && schema.properties.result) {
    return toTs(schema.properties.result);
  }
  if (schema.type === 'object' && schema.properties) {
    const req = new Set(schema.required || []);
    const props = Object.entries(schema.properties).map(([k, v]) => {
      const opt = req.has(k) ? '' : '?';
      const t = (() => {
        if (v.type === 'number' || v.type === 'integer') return 'number';
        if (v.type === 'string') return 'string';
        if (v.type === 'boolean') return 'boolean';
        if (v.type === 'array') return `${toTs(v.items)}[]`;
        if (v.anyOf) return v.anyOf.map(toTs).join(' | ');
        if (v.$ref) return 'any';
        return 'any';
      })();
      return `  ${k}${opt}: ${t};`;
    }).join('\n');
    return `{\n${props}\n}`;
  }
  return 'any';
};

let dts = `// AUTO-GENERATED: do not edit\nexport interface McpTools {\n`;
for (const t of tools) {
  const argsT = t.inputSchema ? toTs(t.inputSchema) : 'void';
  const outT  = t.outputSchema ? toTs(t.outputSchema) : 'void';
  dts += `  "${t.name}": (args${argsT==='void'?'?': ''}: ${argsT==='void'?'{}':argsT}) => Promise<${outT}>;\n`;
}
dts += `}\nexport type McpToolNames = keyof McpTools;\n`;

const outPath = path.join(proj, 'src', 'types');
fs.mkdirSync(outPath, { recursive: true });
fs.writeFileSync(path.join(outPath, 'mcp-tools.gen.d.ts'), dts);
console.log('Wrote src/types/mcp-tools.gen.d.ts');
