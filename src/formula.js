(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.FormulaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ERR = '#ERR!';
  const DIV_ZERO = '#DIV/0!';
  const CIRC = '#CIRC!';

  function normalizeInput(raw) {
    if (raw == null || raw === '') {
      return { type: 'empty', raw: '' };
    }
    if (typeof raw !== 'string') {
      raw = String(raw);
    }
    if (raw[0] === '=') {
      return { type: 'formula', raw: raw };
    }
    const trimmed = raw.trim();
    if (trimmed !== '' && !Number.isNaN(Number(trimmed))) {
      return { type: 'number', raw: raw, value: Number(trimmed) };
    }
    return { type: 'text', raw: raw, value: raw };
  }

  function evaluateCell(cellId, cells) {
    return evaluateSheet(cells || {})[cellId] || makeValue('', '', 0, false);
  }

  function evaluateSheet(cells) {
    const entries = cells || {};
    const cache = new Map();
    const visiting = new Set();

    function getCell(id) {
      if (cache.has(id)) {
        return cache.get(id);
      }

      const raw = entries[id] || '';
      const normalized = normalizeInput(raw);
      let result;

      if (normalized.type === 'empty') {
        result = makeValue(raw, '', 0, false);
      } else if (normalized.type === 'number') {
        result = makeValue(raw, formatValue(normalized.value), normalized.value, false);
      } else if (normalized.type === 'text') {
        result = makeValue(raw, normalized.value, normalized.value, false);
      } else if (visiting.has(id)) {
        result = makeError(raw, CIRC, CIRC);
      } else {
        visiting.add(id);
        result = evaluateFormulaCell(raw);
        visiting.delete(id);
      }

      cache.set(id, result);
      return result;
    }

    function evaluateFormulaCell(raw) {
      try {
        const parser = new Parser(raw.slice(1));
        const ast = parser.parseExpression();
        parser.expect('eof');
        const computed = evaluateNode(ast, getReferenceValue, getRangeValues);
        if (computed && computed.error) {
          return makeError(raw, computed.display, computed.error);
        }
        return makeValue(raw, formatValue(computed), computed, true);
      } catch (error) {
        if (error && error.code === 'CIRC') {
          return makeError(raw, CIRC, CIRC);
        }
        if (error && error.code === 'DIV0') {
          return makeError(raw, DIV_ZERO, DIV_ZERO);
        }
        return makeError(raw, ERR, ERR);
      }
    }

    function getReferenceValue(ref) {
      const target = getCell(ref);
      if (target.error === CIRC) {
        const error = new Error(CIRC);
        error.code = 'CIRC';
        throw error;
      }
      if (target.error) {
        return { error: target.error, display: target.display };
      }
      if (typeof target.value === 'number') {
        return target.value;
      }
      if (target.value === '') {
        return 0;
      }
      const numeric = Number(target.value);
      return Number.isNaN(numeric) ? 0 : numeric;
    }

    function getRangeValues(startRef, endRef) {
      return expandRange(startRef, endRef).map(function (ref) {
        const target = getCell(ref);
        if (!target.raw) {
          return '';
        }
        return getReferenceValue(ref);
      });
    }

    const result = {};
    Object.keys(entries).forEach(function (id) {
      result[id] = getCell(id);
    });
    return result;
  }

  function makeValue(raw, display, value, formula) {
    return { raw: raw, display: display, value: value, formula: formula, error: null, kind: typeof value === 'number' ? 'number' : 'text' };
  }

  function makeError(raw, display, error) {
    return { raw: raw, display: display, value: null, formula: true, error: error, kind: 'error' };
  }

  function formatValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        return ERR;
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, '');
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function evaluateNode(node, getReferenceValue, getRangeValues) {
    switch (node.type) {
      case 'number':
        return node.value;
      case 'reference':
        return getReferenceValue(node.ref);
      case 'unary':
        return -asNumber(evaluateNode(node.argument, getReferenceValue, getRangeValues));
      case 'binary':
        return evaluateBinary(node, getReferenceValue, getRangeValues);
      case 'call':
        return evaluateCall(node, getReferenceValue, getRangeValues);
      default:
        throw new Error('Unknown node');
    }
  }

  function evaluateBinary(node, getReferenceValue, getRangeValues) {
    const leftRaw = evaluateNode(node.left, getReferenceValue, getRangeValues);
    const rightRaw = evaluateNode(node.right, getReferenceValue, getRangeValues);
    if (leftRaw && leftRaw.error) return leftRaw;
    if (rightRaw && rightRaw.error) return rightRaw;
    const left = asNumber(leftRaw);
    const right = asNumber(rightRaw);

    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/':
        if (right === 0) {
          const error = new Error(DIV_ZERO);
          error.code = 'DIV0';
          throw error;
        }
        return left / right;
      case '=': return left === right;
      case '!=':
      case '<>': return left !== right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '>=': return left >= right;
      default: throw new Error('Bad operator');
    }
  }

  function evaluateCall(node, getReferenceValue, getRangeValues) {
    const name = node.name.toUpperCase();
    if (name === 'IF') {
      if (node.args.length !== 3) {
        throw new Error('IF arity');
      }
      const condition = evaluateNode(node.args[0], getReferenceValue, getRangeValues);
      if (condition && condition.error) {
        return condition;
      }
      return truthy(condition)
        ? evaluateNode(node.args[1], getReferenceValue, getRangeValues)
        : evaluateNode(node.args[2], getReferenceValue, getRangeValues);
    }

    if (name === 'COUNT') {
      const countValues = [];
      node.args.forEach(function (arg) {
        if (arg.type === 'range') {
          getRangeValues(arg.start, arg.end).forEach(function (value) {
            countValues.push(value);
          });
          return;
        }

        if (arg.type === 'reference') {
          countValues.push(getRangeValues(arg.ref, arg.ref)[0]);
          return;
        }

        countValues.push(evaluateNode(arg, getReferenceValue, getRangeValues));
      });

      for (let index = 0; index < countValues.length; index += 1) {
        if (countValues[index] && countValues[index].error) {
          return countValues[index];
        }
      }

      return countValues.filter(function (value) { return value !== '' && value != null; }).length;
    }

    const values = [];
    node.args.forEach(function (arg) {
      if (arg.type === 'range') {
        getRangeValues(arg.start, arg.end).forEach(function (value) {
          values.push(value);
        });
      } else {
        values.push(evaluateNode(arg, getReferenceValue, getRangeValues));
      }
    });

    for (let index = 0; index < values.length; index += 1) {
      if (values[index] && values[index].error) {
        return values[index];
      }
    }

    const numbers = values.map(asNumber);
    switch (name) {
      case 'SUM': return numbers.reduce(function (sum, value) { return sum + value; }, 0);
      case 'AVERAGE': return numbers.length ? numbers.reduce(function (sum, value) { return sum + value; }, 0) / numbers.length : 0;
      case 'MIN': return numbers.length ? Math.min.apply(Math, numbers) : 0;
      case 'MAX': return numbers.length ? Math.max.apply(Math, numbers) : 0;
      default: throw new Error('Unknown function');
    }
  }

  function truthy(value) {
    if (value && value.error) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    return asNumber(value) !== 0;
  }

  function asNumber(value) {
    if (value && value.error) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    if (value === '' || value == null) {
      return 0;
    }
    const numeric = Number(value);
    return Number.isNaN(numeric) ? 0 : numeric;
  }

  function expandRange(startRef, endRef) {
    const start = splitCellRef(startRef);
    const end = splitCellRef(endRef);
    const refs = [];
    for (let row = Math.min(start.row, end.row); row <= Math.max(start.row, end.row); row += 1) {
      for (let col = Math.min(start.col, end.col); col <= Math.max(start.col, end.col); col += 1) {
        refs.push(positionToCellId(col, row));
      }
    }
    return refs;
  }

  function splitCellRef(ref) {
    const match = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!match) {
      throw new Error('Bad ref');
    }
    let col = 0;
    for (let index = 0; index < match[1].length; index += 1) {
      col = col * 26 + (match[1].charCodeAt(index) - 64);
    }
    return { col: col - 1, row: Number(match[2]) - 1 };
  }

  function positionToCellId(col, row) {
    let value = col + 1;
    let letters = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      letters = String.fromCharCode(65 + remainder) + letters;
      value = Math.floor((value - remainder - 1) / 26);
    }
    return letters + String(row + 1);
  }

  function Parser(source) {
    this.tokens = tokenize(source);
    this.index = 0;
  }

  Parser.prototype.current = function () {
    return this.tokens[this.index];
  };

  Parser.prototype.expect = function (type, value) {
    const token = this.current();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error('Unexpected token');
    }
    this.index += 1;
    return token;
  };

  Parser.prototype.match = function (type, value) {
    const token = this.current();
    if (token && token.type === type && (value === undefined || token.value === value)) {
      this.index += 1;
      return token;
    }
    return null;
  };

  Parser.prototype.parseExpression = function () {
    return this.parseComparison();
  };

  Parser.prototype.parseComparison = function () {
    let expression = this.parseAdditive();
    while (this.current() && this.current().type === 'operator' && ['=', '!=', '<>', '<', '<=', '>', '>='].indexOf(this.current().value) !== -1) {
      const operator = this.expect('operator').value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseAdditive() };
    }
    return expression;
  };

  Parser.prototype.parseAdditive = function () {
    let expression = this.parseMultiplicative();
    while (this.current() && this.current().type === 'operator' && ['+', '-'].indexOf(this.current().value) !== -1) {
      const operator = this.expect('operator').value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseMultiplicative() };
    }
    return expression;
  };

  Parser.prototype.parseMultiplicative = function () {
    let expression = this.parseUnary();
    while (this.current() && this.current().type === 'operator' && ['*', '/'].indexOf(this.current().value) !== -1) {
      const operator = this.expect('operator').value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseUnary() };
    }
    return expression;
  };

  Parser.prototype.parseUnary = function () {
    if (this.match('operator', '-')) {
      return { type: 'unary', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    const token = this.current();
    if (!token) {
      throw new Error('Unexpected end');
    }
    if (token.type === 'number') {
      this.index += 1;
      return { type: 'number', value: token.value };
    }
    if (token.type === 'identifier') {
      this.index += 1;
      const identifier = token.value;
      if (this.match('operator', '(')) {
        const args = [];
        if (!this.match('operator', ')')) {
          do {
            args.push(this.parseArgument());
          } while (this.match('operator', ','));
          this.expect('operator', ')');
        }
        return { type: 'call', name: identifier, args: args };
      }
      if (this.match('operator', ':')) {
        const end = this.expect('identifier').value;
        return { type: 'range', start: identifier, end: end };
      }
      return { type: 'reference', ref: identifier };
    }
    if (this.match('operator', '(')) {
      const inner = this.parseExpression();
      this.expect('operator', ')');
      return inner;
    }
    throw new Error('Bad token');
  };

  Parser.prototype.parseArgument = function () {
    return this.parseExpression();
  };

  function tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
      const char = source.charAt(index);
      if (/\s/.test(char)) {
        index += 1;
        continue;
      }
      const pair = source.slice(index, index + 2);
      if (/^(<=|>=|!=|<>)$/.test(pair)) {
        tokens.push({ type: 'operator', value: pair });
        index += 2;
        continue;
      }
      if ('+-*/(),:<=>'.indexOf(char) !== -1) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }
      const numberMatch = source.slice(index).match(/^\d+(?:\.\d+)?/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const identifierMatch = source.slice(index).match(/^[A-Za-z]+\d*/);
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0].toUpperCase() });
        index += identifierMatch[0].length;
        continue;
      }
      throw new Error('Invalid token');
    }
    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  return {
    evaluateCell: evaluateCell,
    evaluateSheet: evaluateSheet,
  };
});
