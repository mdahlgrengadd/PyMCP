import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const proj = path.resolve(process.cwd());

// Try multiple Python commands
const pythonCommands = ['python3', 'python'];
let py;
let pythonCmd;

for (const cmd of pythonCommands) {
  py = spawnSync(cmd, ['tools_dump.py'], { cwd: proj, encoding: 'utf8' });
  if (py.status === 0) {
    pythonCmd = cmd;
    break;
  }
}

if (py.status !== 0) {
  console.error('Failed to run tools_dump.py');
  console.error('Make sure Python is available and pydantic is installed:');
  console.error('  pip install pydantic');
  console.error('or');
  console.error('  pip3 install pydantic');
  if (py.stderr) {
    console.error('\nError output:');
    console.error(py.stderr);
  }
  process.exit(1);
}

const { tools } = JSON.parse(py.stdout);

const toTs = (schema, defs = {}) => {
  if (!schema) return 'void';
  
  // Handle $ref
  if (schema.$ref) {
    const refPath = schema.$ref.replace('#/$defs/', '');
    if (defs[refPath]) {
      return toTs(defs[refPath], defs);
    }
    return 'any';
  }
  
  // Try unwrap single-field result models
  if (schema.properties && schema.properties.result) {
    return toTs(schema.properties.result, defs);
  }
  
  if (schema.type === 'object' && schema.properties) {
    const req = new Set(schema.required || []);
    const props = Object.entries(schema.properties).map(([k, v]) => {
      const opt = req.has(k) ? '' : '?';
      const t = (() => {
        if (v.type === 'number' || v.type === 'integer') return 'number';
        if (v.type === 'string') return 'string';
        if (v.type === 'boolean') return 'boolean';
        if (v.type === 'array') return `${toTs(v.items, defs)}[]`;
        if (v.anyOf) return v.anyOf.map(s => toTs(s, defs)).join(' | ');
        if (v.$ref) return toTs(v, defs);
        return 'any';
      })();
      return `  ${k}${opt}: ${t};`;
    }).join('\n');
    return `{\n${props}\n}`;
  }
  
  // Handle primitive types
  if (schema.type === 'string') return 'string';
  if (schema.type === 'number' || schema.type === 'integer') return 'number';
  if (schema.type === 'boolean') return 'boolean';
  
  return 'any';
};

let dts = `// AUTO-GENERATED: do not edit\nexport interface McpTools {\n`;
for (const t of tools) {
  const defs = t.outputSchema?.$defs || {};
  const argsT = t.inputSchema ? toTs(t.inputSchema, defs) : 'void';
  const outT  = t.outputSchema ? toTs(t.outputSchema, defs) : 'void';
  dts += `  "${t.name}": (args${argsT==='void'?'?': ''}: ${argsT==='void'?'{}':argsT}) => Promise<${outT}>;\n`;
}
dts += `}\nexport type McpToolNames = keyof McpTools;\n`;

const outPath = path.join(proj, 'src', 'types');
fs.mkdirSync(outPath, { recursive: true });
fs.writeFileSync(path.join(outPath, 'mcp-tools.gen.d.ts'), dts);
console.log('Wrote src/types/mcp-tools.gen.d.ts');
