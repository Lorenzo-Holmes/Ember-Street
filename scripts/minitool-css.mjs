import postcss from 'postcss';
import { transform } from 'lightningcss';

export const hasClasses = [
  [':has(.notebook-page)', '.mt-notebook'],
  [':has(.v6-shell--dusk)', '.mt-dusk'],
  [':has(.v1-title-screen)', '.mt-title'],
  [':has(.v1-menu-sheet[open])', '.mt-dialog-open'],
  [':has(.v6-topbar__brand)', '.mt-brand'],
  [':has(+ .v1-bottom-nav)', '.mt-next-nav'],
];

function splitTop(value, separator = ',') {
  const parts = [];
  let depth = 0, start = 0, quote = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (quote) { if (char === quote && value[i - 1] !== '\\') quote = ''; continue; }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(' || char === '[') depth++;
    if (char === ')' || char === ']') depth--;
    if (!depth && char === separator) { parts.push(value.slice(start, i).trim()); start = i + 1; }
  }
  parts.push(value.slice(start).trim());
  return parts;
}

function closingParen(value, start) {
  let depth = 1;
  for (let i = start + 1; i < value.length; i++) {
    if (value[i] === '(') depth++;
    if (value[i] === ')' && --depth === 0) return i;
    if (value[i] !== ')') continue;
  }
  throw new Error(`Unbalanced CSS function: ${value}`);
}

function expandSelector(selector) {
  // De Morgan: negated alternatives must become a conjunction, not separate rules.
  const negated = /:not\(:(?:is|where)\(/.exec(selector);
  if (negated) {
    const open = negated.index + negated[0].length - 1;
    const close = closingParen(selector, open);
    const replacements = splitTop(selector.slice(open + 1, close)).map((part) => `:not(${part})`).join('');
    return expandSelector(selector.slice(0, negated.index) + replacements + selector.slice(close + 2));
  }
  const match = /:(?:is|where)\(/.exec(selector);
  if (!match) return [selector.replace(/:focus-visible/g, ':focus')];
  const open = match.index + match[0].length - 1;
  const close = closingParen(selector, open);
  return splitTop(selector.slice(open + 1, close)).flatMap((part) =>
    expandSelector(selector.slice(0, match.index) + part + selector.slice(close + 1)));
}

function fallbackValue(value) {
  let result = value.replace(/\b(\d*\.?\d+)(?:svh|dvh|lvh)\b/g, '$1vh')
    .replace(/\b(\d*\.?\d+)cqw\b/g, (_, number) => `${Number(number) * 4.8}px`);
  let match;
  while ((match = /\b(min|max|clamp)\(/.exec(result))) {
    const open = match.index + match[0].length - 1;
    const close = closingParen(result, open);
    const parts = splitTop(result.slice(open + 1, close));
    const replacement = match[1] === 'clamp' || match[1] === 'max' ? parts[0]
      : parts.find((part) => /%|vw/.test(part) && !/\b(?:min|max|clamp)\(/.test(part)) ?? parts[0];
    result = result.slice(0, match.index) + replacement + result.slice(close + 1);
  }
  return result;
}

export function compileMinitoolCss(css) {
  const root = postcss.parse(css);
  root.walkRules((rule) => {
    for (const [selector, className] of hasClasses) rule.selector = rule.selector.split(selector).join(className);
    if (rule.selector.includes(':has(')) throw new Error(`Unmapped relational selector: ${rule.selector}`);
    rule.selector = splitTop(rule.selector).flatMap(expandSelector).join(',\n');
  });
  root.walkDecls((declaration) => {
    if (['gap', 'row-gap', 'column-gap'].includes(declaration.prop)) {
      declaration.cloneBefore({ prop: `grid-${declaration.prop}` });
    }
    if (declaration.value.includes('env(safe-area-inset-')) {
      const value = declaration.value.replace(/env\((safe-area-inset-[a-z]+)(?:,\s*[^)]+)?\)/g,
        (_, name) => `var(--${name}, env(${name}, 0px))`);
      declaration.value = value;
    }
    const fallback = fallbackValue(declaration.value);
    if (fallback !== declaration.value) declaration.cloneBefore({ value: fallback });
    if (declaration.prop === 'overflow' && declaration.value === 'clip') declaration.cloneBefore({ value: 'hidden' });
    if (declaration.prop === 'overflow-wrap' && declaration.value === 'anywhere') declaration.cloneBefore({ value: 'break-word' });
  });
  return transform({ filename: 'minitool.css', code: Buffer.from(root.toString()),
    targets: { chrome: 61 << 16, ios_saf: (18 << 16) | (4 << 8) }, minify: false }).code.toString();
}
