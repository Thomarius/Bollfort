/**
 * Valve's KeyValues text (VDF), as Steamworks reads its build scripts and localisation files:
 * quoted keys and values, blocks in braces, a tab an indent. Only what the files here need.
 */
export type Vdf = { [key: string]: string | Vdf } | [string, string | Vdf][];

/** A string quoted for VDF: a backslash and a quote escaped. */
export function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * A block written out. An array keeps its order and allows a key twice — the depot scripts'
 * `FileMapping` may repeat.
 */
export function vdf(key: string, body: Vdf, depth = 0): string {
  const pad = '\t'.repeat(depth);
  const entries = Array.isArray(body) ? body : Object.entries(body);
  const lines = entries.map(([k, v]) =>
    typeof v === 'string' ? `${pad}\t${quote(k)}\t${quote(v)}` : vdf(k, v, depth + 1),
  );
  return [`${pad}${quote(key)}`, `${pad}{`, ...lines, `${pad}}`].join('\n');
}
