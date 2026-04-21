(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
    return;
  }
  root.SpreadsheetFormula = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const CELL_REF_RE = /^\$?([A-Z]+)\$?(\d+)$/;

  function createFormulaEngine(rawCells) {
    const cells = rawCells || {};
    const cache = new Map();
    const evaluating = new Set();

    function getCellValue(address) {
      if (cache.has(address)) {
        return cache.get(address);
      }

      if (evaluating.has(address)) {
        return { type: 'error', code: '#CIRC!' };
      }

      evaluating.add(address);
      const result = evaluateRaw(cells[address] || '');
      evaluating.delete(address);
      cache.set(address, result);
      return result;
    }

    function evaluateRaw(raw) {
      if (raw == null || raw === '') {
        return { type: 'blank', value: '' };
      }

      if (typeof raw !== 'string') {
        return { type: 'number', value: Number(raw) || 0 };
      }

      if (raw[0] !== '=') {
        const trimmed = raw.trim();
        if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
          return { type: 'number', value: Number(trimmed) };
        }
        if (/^(TRUE|FALSE)$/i.test(trimmed)) {
          return { type: 'boolean', value: trimmed.toUpperCase() === 'TRUE' };
        }
        return { type: 'text', value: raw };
      }

      try {
        const parser = createParser(raw.slice(1));
        const ast = parser.parseExpression();
        parser.expectEnd();
        return evaluateNode(ast);
      } catch (error) {
        if (error && error.code) {
          return { type: 'error', code: error.code };
        }
        return { type: 'error', code: '#ERR!' };
      }
    }

    function evaluateNode(node) {
      switch (node.type) {
        case 'number':
        case 'text':
        case 'boolean':
          return node;
        case 'cell':
          return getCellValue(node.address);
        case 'range':
          return { type: 'range', value: expandRange(node.start, node.end).map(getCellValue) };
        case 'unary': {
          const value = coerceNumber(evaluateNode(node.value));
          return { type: 'number', value: -value };
        }
        case 'binary':
          return evaluateBinary(node);
        case 'call':
          return evaluateCall(node);
        default:
          throw { code: '#ERR!' };
      }
    }

    function evaluateBinary(node) {
      if (node.operator === '&') {
        return {
          type: 'text',
          value: coerceText(evaluateNode(node.left)) + coerceText(evaluateNode(node.right))
        };
      }

      if (/^(=|<>|<|<=|>|>=)$/.test(node.operator)) {
        const left = evaluateNode(node.left);
        const right = evaluateNode(node.right);
        const result = compareValues(left, right, node.operator);
        return { type: 'boolean', value: result };
      }

      const left = coerceNumber(evaluateNode(node.left));
      const right = coerceNumber(evaluateNode(node.right));

      if (node.operator === '+') {
        return { type: 'number', value: left + right };
      }
      if (node.operator === '-') {
        return { type: 'number', value: left - right };
      }
      if (node.operator === '*') {
        return { type: 'number', value: left * right };
      }
      if (node.operator === '/') {
        if (right === 0) {
          throw { code: '#DIV/0!' };
        }
        return { type: 'number', value: left / right };
      }

      throw { code: '#ERR!' };
    }

    function evaluateCall(node) {
      const name = node.name.toUpperCase();
      const args = node.args.map(evaluateNode);

      if (name === 'SUM') {
        return { type: 'number', value: flattenArgs(args).reduce((sum, value) => sum + coerceNumber(value), 0) };
      }
      if (name === 'AVERAGE') {
        const values = flattenArgs(args);
        return { type: 'number', value: values.length ? values.reduce((sum, value) => sum + coerceNumber(value), 0) / values.length : 0 };
      }
      if (name === 'MIN') {
        const values = flattenArgs(args).map(coerceNumber);
        return { type: 'number', value: values.length ? Math.min.apply(null, values) : 0 };
      }
      if (name === 'MAX') {
        const values = flattenArgs(args).map(coerceNumber);
        return { type: 'number', value: values.length ? Math.max.apply(null, values) : 0 };
      }
      if (name === 'COUNT') {
        const values = flattenArgs(args).filter((value) => value.type === 'number');
        return { type: 'number', value: values.length };
      }
      if (name === 'IF') {
        return truthy(args[0]) ? args[1] || { type: 'blank', value: '' } : args[2] || { type: 'blank', value: '' };
      }
      if (name === 'AND') {
        return { type: 'boolean', value: args.every(truthy) };
      }
      if (name === 'OR') {
        return { type: 'boolean', value: args.some(truthy) };
      }
      if (name === 'NOT') {
        return { type: 'boolean', value: !truthy(args[0]) };
      }
      if (name === 'ABS') {
        return { type: 'number', value: Math.abs(coerceNumber(args[0])) };
      }
      if (name === 'ROUND') {
        const value = coerceNumber(args[0]);
        const digits = args[1] ? coerceNumber(args[1]) : 0;
        const factor = Math.pow(10, digits);
        return { type: 'number', value: Math.round(value * factor) / factor };
      }
      if (name === 'CONCAT') {
        return { type: 'text', value: flattenArgs(args).map(coerceText).join('') };
      }

      throw { code: '#ERR!' };
    }

    function flattenArgs(args) {
      const values = [];
      args.forEach((arg) => {
        if (arg.type === 'range') {
          values.push.apply(values, arg.value);
          return;
        }
        values.push(arg);
      });
      return values;
    }

    function compareValues(left, right, operator) {
      const leftValue = comparable(left);
      const rightValue = comparable(right);
      if (operator === '=') return leftValue === rightValue;
      if (operator === '<>') return leftValue !== rightValue;
      if (operator === '<') return leftValue < rightValue;
      if (operator === '<=') return leftValue <= rightValue;
      if (operator === '>') return leftValue > rightValue;
      if (operator === '>=') return leftValue >= rightValue;
      throw { code: '#ERR!' };
    }

    function comparable(value) {
      if (value.type === 'number') return value.value;
      if (value.type === 'boolean') return value.value;
      if (value.type === 'blank') return 0;
      return coerceText(value);
    }

    function truthy(value) {
      if (!value || value.type === 'blank') return false;
      if (value.type === 'boolean') return value.value;
      if (value.type === 'number') return value.value !== 0;
      if (value.type === 'text') return value.value !== '';
      return false;
    }

    function coerceNumber(value) {
      if (!value || value.type === 'blank') return 0;
      if (value.type === 'number') return value.value;
      if (value.type === 'boolean') return value.value ? 1 : 0;
      if (value.type === 'text') {
        const numeric = Number(value.value);
        return Number.isNaN(numeric) ? 0 : numeric;
      }
      if (value.type === 'error') throw { code: value.code };
      return 0;
    }

    function coerceText(value) {
      if (!value || value.type === 'blank') return '';
      if (value.type === 'text') return value.value;
      if (value.type === 'number') return formatNumber(value.value);
      if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
      if (value.type === 'error') throw { code: value.code };
      return '';
    }

    function formatDisplay(value) {
      if (!value || value.type === 'blank') return '';
      if (value.type === 'error') return value.code;
      if (value.type === 'text') return value.value;
      if (value.type === 'boolean') return value.value ? 'TRUE' : 'FALSE';
      if (value.type === 'number') return formatNumber(value.value);
      return '';
    }

    function formatNumber(value) {
      if (Number.isInteger(value)) {
        return String(value);
      }
      return String(Number(value.toFixed(10)));
    }

    return {
      getCellDisplay(address) {
        return formatDisplay(getCellValue(address));
      },
      getCellValue
    };
  }

  function expandRange(start, end) {
    const startRef = parseCellAddress(start);
    const endRef = parseCellAddress(end);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const minCol = Math.min(startRef.col, endRef.col);
    const maxCol = Math.max(startRef.col, endRef.col);
    const cells = [];

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        cells.push(formatCellAddress(col, row));
      }
    }

    return cells;
  }

  function parseCellAddress(address) {
    const match = CELL_REF_RE.exec(address);
    if (!match) {
      throw { code: '#REF!' };
    }
    return {
      col: columnToIndex(match[1]),
      row: Number(match[2])
    };
  }

  function formatCellAddress(col, row) {
    return indexToColumn(col) + String(row);
  }

  function columnToIndex(label) {
    let value = 0;
    for (let index = 0; index < label.length; index += 1) {
      value = value * 26 + (label.charCodeAt(index) - 64);
    }
    return value;
  }

  function indexToColumn(index) {
    let value = index;
    let result = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      result = String.fromCharCode(65 + remainder) + result;
      value = Math.floor((value - 1) / 26);
    }
    return result;
  }

  function createParser(source) {
    const tokens = tokenize(source);
    let index = 0;

    function current() {
      return tokens[index];
    }

    function match(type, value) {
      const token = current();
      if (!token || token.type !== type) return false;
      if (value != null && token.value !== value) return false;
      index += 1;
      return token;
    }

    function expect(type, value) {
      const token = match(type, value);
      if (!token) throw { code: '#ERR!' };
      return token;
    }

    function parsePrimary() {
      const token = current();
      if (!token) throw { code: '#ERR!' };

      if (match('operator', '(')) {
        const expression = parseExpression();
        expect('operator', ')');
        return expression;
      }

      if (match('operator', '-')) {
        return { type: 'unary', value: parsePrimary() };
      }

      if (token.type === 'number') {
        index += 1;
        return { type: 'number', value: Number(token.value) };
      }

      if (token.type === 'string') {
        index += 1;
        return { type: 'text', value: token.value };
      }

      if (token.type === 'boolean') {
        index += 1;
        return { type: 'boolean', value: token.value === 'TRUE' };
      }

      if (token.type === 'identifier') {
        index += 1;
        if (match('operator', '(')) {
          const args = [];
          if (!match('operator', ')')) {
            do {
              args.push(parseExpression());
            } while (match('operator', ','));
            expect('operator', ')');
          }
          return { type: 'call', name: token.value, args };
        }

        if (CELL_REF_RE.test(token.value)) {
          const start = token.value;
          if (match('operator', ':')) {
            const end = expect('identifier').value;
            return { type: 'range', start, end };
          }
          return { type: 'cell', address: start.replace(/\$/g, '') };
        }
      }

      throw { code: '#ERR!' };
    }

    function parseProduct() {
      let left = parsePrimary();
      while (current() && current().type === 'operator' && (current().value === '*' || current().value === '/')) {
        const operator = current().value;
        index += 1;
        left = { type: 'binary', operator, left, right: parsePrimary() };
      }
      return left;
    }

    function parseSum() {
      let left = parseProduct();
      while (current() && current().type === 'operator' && (current().value === '+' || current().value === '-')) {
        const operator = current().value;
        index += 1;
        left = { type: 'binary', operator, left, right: parseProduct() };
      }
      return left;
    }

    function parseConcat() {
      let left = parseSum();
      while (match('operator', '&')) {
        left = { type: 'binary', operator: '&', left, right: parseSum() };
      }
      return left;
    }

    function parseComparison() {
      let left = parseConcat();
      while (current() && current().type === 'operator' && /^(=|<>|<|<=|>|>=)$/.test(current().value)) {
        const operator = current().value;
        index += 1;
        left = { type: 'binary', operator, left, right: parseConcat() };
      }
      return left;
    }

    function parseExpression() {
      return parseComparison();
    }

    return {
      parseExpression,
      expectEnd() {
        if (index !== tokens.length) {
          throw { code: '#ERR!' };
        }
      }
    };
  }

  function tokenize(source) {
    const tokens = [];
    let index = 0;

    while (index < source.length) {
      const char = source[index];
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      if (char === '"') {
        let end = index + 1;
        let value = '';
        while (end < source.length && source[end] !== '"') {
          value += source[end];
          end += 1;
        }
        if (source[end] !== '"') throw { code: '#ERR!' };
        tokens.push({ type: 'string', value });
        index = end + 1;
        continue;
      }
      if (/[0-9.]/.test(char)) {
        let end = index + 1;
        while (end < source.length && /[0-9.]/.test(source[end])) {
          end += 1;
        }
        tokens.push({ type: 'number', value: source.slice(index, end) });
        index = end;
        continue;
      }
      if (/[A-Z$]/i.test(char)) {
        let end = index + 1;
        while (end < source.length && /[A-Z0-9$]/i.test(source[end])) {
          end += 1;
        }
        const value = source.slice(index, end).toUpperCase();
        if (value === 'TRUE' || value === 'FALSE') {
          tokens.push({ type: 'boolean', value });
        } else {
          tokens.push({ type: 'identifier', value });
        }
        index = end;
        continue;
      }
      const two = source.slice(index, index + 2);
      if (two === '<=' || two === '>=' || two === '<>') {
        tokens.push({ type: 'operator', value: two });
        index += 2;
        continue;
      }
      if ('+-*/(),:=<>&'.indexOf(char) !== -1) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }
      throw { code: '#ERR!' };
    }

    return tokens;
  }

  return { createFormulaEngine };
});
