const limit = 160;
const ignoredTokens = new Set(['String', 'Template', 'JSXText']);
const url = /https?:\/\/[^\s<>"'`]+/g;

function withoutSpans(line, spans) {
  let result = '';
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start >= cursor) result += line.slice(cursor, start);
    cursor = Math.max(cursor, end);
  }
  return result + line.slice(cursor);
}

export default {
  meta: {
    type: 'layout',
    schema: [],
    messages: {
      long: 'Source lines may contain at most 160 characters outside URLs and literals.',
    },
  },
  create({ sourceCode, filename, report }) {
    return {
      Program() {
        const longLines = new Map();
        for (const [index, text] of sourceCode.lines.entries()) {
          if (text.length > limit) longLines.set(index + 1, []);
        }
        if (!longLines.size) return;
        for (const token of sourceCode.getTokens(sourceCode.ast)) {
          if (!ignoredTokens.has(token.type)) continue;
          const { start, end } = token.loc;
          for (let line = start.line; line <= end.line; line++) {
            const spans = longLines.get(line);
            if (!spans) continue;
            spans.push([
              line === start.line ? start.column : 0,
              line === end.line ? end.column : sourceCode.lines[line - 1].length,
            ]);
          }
        }
        const plainSource = /\.(?:css|sql)$/.test(filename);
        for (const [line, spans] of longLines) {
          const text = sourceCode.lines[line - 1];
          const code = plainSource
            ? text.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, '')
            : withoutSpans(text, spans);
          if (Array.from(code.replace(url, '')).length > limit) {
            report({ loc: { line, column: limit }, messageId: 'long' });
          }
        }
      },
    };
  },
};

// CSS and SQL only use the line-length rule, which receives their original text.
export const textParser = {
  parse(text) {
    const lines = text.split(/\r\n|\n|\r/);
    return {
      type: 'Program',
      sourceType: 'module',
      body: [],
      tokens: [],
      comments: [],
      range: [0, text.length],
      loc: {
        start: { line: 1, column: 0 },
        end: { line: lines.length, column: lines.at(-1).length },
      },
    };
  },
};
