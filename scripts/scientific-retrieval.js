import {readdirSync, readFileSync, statSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const SCIENTIFIC_DOCS = [
  'docs/architecture/scientific-models.md',
  'docs/caso-zootecnico-demonstrativo.md',
  'docs/fontes-dados-candidatos.md',
  'docs/parametros-e-fontes.md',
  'docs/revisao-independente-caso.md',
];
const TOKEN_PATTERN = /[\p{L}\p{N}]+/gu;

function tokenize(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('und')
    .match(TOKEN_PATTERN) ?? [];
}

function candidateChunks(document) {
  const lines = document.content.replace(/\r\n?/g, '\n').split('\n');
  const chunks = [];

  if (document.path.toLowerCase().endsWith('.md')) {
    let start = -1;
    let current = [];
    const flush = end => {
      if (current.length) {
        chunks.push({startLine: start, endLine: end, text: current.join('\n')});
        current = [];
      }
    };

    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].trim()) {
        flush(index);
        start = -1;
      } else {
        if (start < 0) start = index + 1;
        current.push(lines[index]);
      }
    }
    flush(lines.length);
    return chunks;
  }

  for (let index = 0; index < lines.length; index += 5) {
    const block = lines.slice(index, index + 5);
    if (block.some(line => line.trim())) {
      chunks.push({startLine: index + 1, endLine: index + block.length, text: block.join('\n')});
    }
  }
  return chunks;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Search a local corpus of source documents using deterministic lexical coverage.
 * A result's source_id is the repository-relative path supplied by the corpus;
 * its location points to the exact lines returned in snippet.
 */
export function searchScientificSources(query, corpus, {topK = 5} = {}) {
  if (!Array.isArray(corpus)) throw new TypeError('corpus must be an array of source documents');
  if (!Number.isInteger(topK) || topK < 1) throw new RangeError('topK must be a positive integer');

  const terms = [...new Set(tokenize(query))].sort();
  if (!terms.length) return [];

  const results = [];
  for (const document of corpus) {
    if (!document || typeof document.source_id !== 'string' || typeof document.path !== 'string' || typeof document.content !== 'string') {
      throw new TypeError('each corpus document must include source_id, path, and content strings');
    }

    for (const chunk of candidateChunks(document)) {
      const chunkTerms = new Set(tokenize(chunk.text));
      const matchedTerms = terms.filter(term => chunkTerms.has(term));
      if (!matchedTerms.length) continue;

      results.push({
        source_id: document.source_id,
        location: {path: document.path, start_line: chunk.startLine, end_line: chunk.endLine},
        snippet: chunk.text,
        score: {
          value: matchedTerms.length / terms.length,
          matched_terms: matchedTerms,
          total_query_terms: terms.length,
          explanation: 'matched unique query terms / unique query terms',
        },
      });
    }
  }

  results.sort((left, right) =>
    right.score.value - left.score.value ||
    compareText(left.location.path, right.location.path) ||
    left.location.start_line - right.location.start_line ||
    left.location.end_line - right.location.end_line ||
    compareText(left.source_id, right.source_id) ||
    compareText(left.snippet, right.snippet),
  );
  return results.slice(0, topK);
}

function listScientificSourcePaths(root) {
  const paths = new Set(SCIENTIFIC_DOCS.filter(path => statSync(resolve(root, path), {throwIfNoEntry: false})?.isFile()));
  const dataRoot = resolve(root, 'data');
  for (const entry of readdirSync(dataRoot, {withFileTypes: true}).filter(item => item.isDirectory())) {
    for (const name of ['manifest.json', 'README.md']) {
      const path = `data/${entry.name}/${name}`;
      if (statSync(resolve(root, path), {throwIfNoEntry: false})?.isFile()) paths.add(path);
    }
  }

  const evidenceRoot = resolve(root, 'docs/evidence');
  for (const entry of readdirSync(evidenceRoot, {withFileTypes: true}).filter(item => item.isFile() && item.name.endsWith('.json') && !item.name.startsWith('rea-'))) {
    paths.add(`docs/evidence/${entry.name}`);
  }
  return [...paths].sort();
}

/** Load existing scientific manifests, evidence reports, and documentation without creating an index or registry. */
export function loadScientificCorpus(root = fileURLToPath(new URL('../', import.meta.url))) {
  const absoluteRoot = resolve(root);
  return listScientificSourcePaths(absoluteRoot).map(path => ({
    source_id: path,
    path,
    content: readFileSync(resolve(absoluteRoot, path), 'utf8'),
  }));
}

function readCliOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--query') options.query = args[++index];
    else if (flag === '--top-k') options.topK = Number(args[++index]);
    else if (flag === '--root') options.root = args[++index];
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!options.query?.trim()) throw new Error('Usage: node scripts/scientific-retrieval.js --query "terms" [--top-k 5]');
  return options;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = readCliOptions(process.argv.slice(2));
    const results = searchScientificSources(options.query, loadScientificCorpus(options.root), {topK: options.topK ?? 5});
    process.stdout.write(`${JSON.stringify({query: options.query, results}, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
