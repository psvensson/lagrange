import fs from 'node:fs';

const files = ['architecture/INDEX.md', 'architecture/system-model.md'];
const init = "%%{init: {'theme':'base','darkMode':false,'themeVariables':{'background':'#ffffff','clusterBkg':'#ffffff','clusterBorder':'#94a3b8','edgeLabelBackground':'#ffffff','lineColor':'#334155','textColor':'#0f172a'}}}%%";

const writeFlow = `\`\`\`mermaid
${init}
flowchart LR
  subgraph CANVAS[" "]
    direction LR
    X["SQL caller or service Cell"]:::ext -->|"routed write"| L["Partition leader"]:::data
    L -->|"append proposal"| LOG["Leader Raft log"]:::data
    LOG -->|"AppendEntries"| F1["Follower A"]:::data
    LOG -->|"AppendEntries"| F2["Follower B"]:::data
    F1 -->|"acknowledge"| Q["Majority reached"]:::ctrl
    F2 -->|"acknowledge"| Q
    Q --> APPLY["Apply to leader SQLite"]:::data
    APPLY -->|"success"| OK["Return to caller"]:::ext
  end

  style CANVAS fill:#ffffff,stroke:#ffffff,color:#0f172a
  classDef data fill:#dbeafe,stroke:#1e40af,color:#0b2545
  classDef ctrl fill:#fef3c7,stroke:#b45309,color:#451a03
  classDef ext fill:#f1f5f9,stroke:#475569,color:#0f172a
\`\`\``;

function wrapMermaid(block) {
  if (block.includes('subgraph CANVAS[" "]')) return block;
  if (block.includes('\nsequenceDiagram\n')) return writeFlow;

  const lines = block.split('\n');
  const closing = lines.pop();
  if (closing !== '```') throw new Error('Malformed Mermaid block');
  if (lines[0] !== '```mermaid') throw new Error('Unexpected Mermaid fence');

  let inner = lines.slice(1);
  if (inner[0]?.startsWith('%%{init:')) inner[0] = init;

  const flowIndex = inner.findIndex((line) => line.startsWith('flowchart '));
  if (flowIndex < 0) throw new Error('Only flowcharts are expected here');
  const direction = inner[flowIndex].split(/\s+/)[1];
  const body = inner.slice(flowIndex + 1);
  let styleIndex = body.findIndex((line) => /^  (style|classDef) /.test(line));
  if (styleIndex < 0) styleIndex = body.length;

  const graph = body.slice(0, styleIndex);
  while (graph.at(-1) === '') graph.pop();
  const styles = body.slice(styleIndex);

  const wrapped = [
    ...inner.slice(0, flowIndex + 1),
    '  subgraph CANVAS[" "]',
    `    direction ${direction}`,
    ...graph.map((line) => (line ? `  ${line}` : '')),
    '  end',
    '',
    '  style CANVAS fill:#ffffff,stroke:#ffffff,color:#0f172a',
    ...styles,
  ];

  return ['```mermaid', ...wrapped, '```'].join('\n');
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const updated = source.replace(/```mermaid\n[\s\S]*?\n```/g, wrapMermaid);
  if (updated === source) throw new Error(`No Mermaid changes produced for ${file}`);
  fs.writeFileSync(file, updated);
}
