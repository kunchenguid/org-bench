(function (globalScope) {
  'use strict';

  const ERROR_CODES = {
    CIRC: '#CIRC!',
    DIV0: '#DIV/0!',
    ERR: '#ERR!',
    NAME: '#NAME?',
    REF: '#REF!',
  };

  class FormulaError extends Error {
    constructor(code, message) {
      super(message || code);
      this.code = code;
    }
  }

  function createSheetEngine(initialCells) {
    const rawCells = new Map();
    const computedCells = new Map();
    const dependencies = new Map();
    const dependents = new Map();

    if (initialCells) {
      for (const [cellId, raw] of Object.entries(initialCells)) {
        rawCells.set(normalizeCellId(cellId), raw == null ? '' : String(raw));
      }
    }

    recalculate();

    return {
      setCell(cellId, raw) {
        const normalized = normalizeCellId(cellId);
        rawCells.set(normalized, raw == null ? '' : String(raw));
        recalculate();
      },

      getCell(cellId) {
        const normalized = normalizeCellId(cellId);
        if (!computedCells.has(normalized)) {
          computedCells.set(normalized, evaluateCell(normalized, new Set(), []));
        }
        return computedCells.get(normalized);
      },

      getRaw(cellId) {
        return rawCells.get(normalizeCellId(cellId)) || '';
      },

      getDependencies(cellId) {
        const normalized = normalizeCellId(cellId);
        return Array.from(dependencies.get(normalized) || []).sort(compareCellIds);
      },

      getDependents(cellId) {
        const normalized = normalizeCellId(cellId);
        return Array.from(dependents.get(normalized) || []).sort(compareCellIds);
      },

      getAllCells() {
        const result = {};
        const ids = Array.from(new Set([...rawCells.keys(), ...computedCells.keys()])).sort(compareCellIds);
        for (const cellId of ids) {
          result[cellId] = this.getCell(cellId);
        }
        return result;
      },
    };

    function recalculate() {
      computedCells.clear();
      dependencies.clear();
      dependents.clear();

      const ids = Array.from(rawCells.keys()).sort(compareCellIds);
      for (const cellId of ids) {
        evaluateCell(cellId, new Set(), []);
      }
    }

    function evaluateCell(cellId, visiting, stack) {
      if (computedCells.has(cellId)) {
        return computedCells.get(cellId);
      }

      if (visiting.has(cellId)) {
        const cycleStart = stack.indexOf(cellId);
        if (cycleStart >= 0) {
          for (let index = cycleStart; index < stack.length; index += 1) {
            setErrorResult(stack[index], ERROR_CODES.CIRC);
          }
        }
        setErrorResult(cellId, ERROR_CODES.CIRC);
        return computedCells.get(cellId);
      }

      visiting.add(cellId);
      stack.push(cellId);

      const raw = rawCells.get(cellId) || '';
      let result;
      try {
        result = evaluateRaw(cellId, raw, visiting, stack);
      } catch (error) {
        result = formatErrorResult(raw, mapErrorCode(error));
      }

      computedCells.set(cellId, result);
      visiting.delete(cellId);
      stack.pop();
      return result;
    }

    function setErrorResult(cellId, code) {
      const raw = rawCells.get(cellId) || '';
      computedCells.set(cellId, formatErrorResult(raw, code));
    }

    function evaluateRaw(cellId, raw, visiting, stack) {
      if (!raw.startsWith('=')) {
        return formatValueResult(raw, parsePlainValue(raw));
      }

      const parser = createParser(raw.slice(1));
      const ast = parser.parse();
      const deps = new Set();
      const value = evaluateAst(ast, {
        currentCellId: cellId,
        deps,
        getCellValue(refId) {
          const normalized = normalizeCellId(refId);
          deps.add(normalized);
          const cell = evaluateCell(normalized, visiting, stack);
          if (cell.error) {
            throw new FormulaError(cell.error);
          }
          return cell.value;
        },
        getRangeValues(startRef, endRef) {
          const ids = expandRange(startRef, endRef);
          return ids.map((refId) => {
            deps.add(refId);
            const cell = evaluateCell(refId, visiting, stack);
            if (cell.error) {
              throw new FormulaError(cell.error);
            }
            return cell.value;
          });
        },
      });

      dependencies.set(cellId, deps);
      for (const depId of deps) {
        if (!dependents.has(depId)) {
          dependents.set(depId, new Set());
        }
        dependents.get(depId).add(cellId);
      }
      return formatValueResult(raw, value);
    }
  }

  function parsePlainValue(raw) {
    if (raw === '') {
      return '';
    }
    const trimmed = raw.trim();
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
      return Number(trimmed);
    }
    return raw;
  }

  function formatValueResult(raw, value) {
    return {
      raw,
      value,
      error: null,
      display: displayValue(value),
    };
  }

  function formatErrorResult(raw, code) {
    return {
      raw,
      value: null,
      error: code,
      display: code,
    };
  }

  function displayValue(value) {
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (value == null) {
      return '';
    }
    return String(value);
  }

  function createParser(input) {
    const tokens = tokenize(input);
    let index = 0;

    return {
      parse() {
        const expr = parseComparison();
        expect('eof');
        return expr;
      },
    };

    function parseComparison() {
      let expr = parseConcat();
      while (matchValue('=', '<>', '<', '<=', '>', '>=')) {
        const operator = previous().value;
        const right = parseConcat();
        expr = { type: 'binary', operator, left: expr, right };
      }
      return expr;
    }

    function parseConcat() {
      let expr = parseAddSubtract();
      while (matchValue('&')) {
        expr = { type: 'binary', operator: '&', left: expr, right: parseAddSubtract() };
      }
      return expr;
    }

    function parseAddSubtract() {
      let expr = parseMultiplyDivide();
      while (matchValue('+', '-')) {
        const operator = previous().value;
        expr = { type: 'binary', operator, left: expr, right: parseMultiplyDivide() };
      }
      return expr;
    }

    function parseMultiplyDivide() {
      let expr = parseUnary();
      while (matchValue('*', '/')) {
        const operator = previous().value;
        expr = { type: 'binary', operator, left: expr, right: parseUnary() };
      }
      return expr;
    }

    function parseUnary() {
      if (matchValue('+', '-')) {
        return { type: 'unary', operator: previous().value, argument: parseUnary() };
      }
      return parseRange();
    }

    function parseRange() {
      let expr = parsePrimary();
      if (matchValue(':')) {
        expr = { type: 'range', start: expr, end: parsePrimary() };
      }
      return expr;
    }

    function parsePrimary() {
      if (match('number')) {
        return { type: 'number', value: previous().value };
      }
      if (match('string')) {
        return { type: 'string', value: previous().value };
      }
      if (match('boolean')) {
        return { type: 'boolean', value: previous().value };
      }
      if (match('identifier')) {
        const name = previous().value;
        if (matchValue('(')) {
          const args = [];
          if (!checkValue(')')) {
            do {
              args.push(parseComparison());
            } while (matchValue(','));
          }
          expectValue(')');
          return { type: 'call', name, args };
        }
        return { type: 'reference', ref: parseCellReferenceToken(name) };
      }
      if (matchValue('(')) {
        const expr = parseComparison();
        expectValue(')');
        return expr;
      }
      throw new FormulaError(ERROR_CODES.ERR, 'Unexpected token');
    }

    function match(type) {
      if (check(type)) {
        index += 1;
        return true;
      }
      return false;
    }

    function matchValue() {
      for (const value of arguments) {
        if (checkValue(value)) {
          index += 1;
          return true;
        }
      }
      return false;
    }

    function check(type) {
      return tokens[index] && tokens[index].type === type;
    }

    function checkValue(value) {
      return tokens[index] && tokens[index].value === value;
    }

    function previous() {
      return tokens[index - 1];
    }

    function expect(type) {
      if (!check(type)) {
        throw new FormulaError(ERROR_CODES.ERR, 'Unexpected token type');
      }
      index += 1;
      return previous();
    }

    function expectValue(value) {
      if (!checkValue(value)) {
        throw new FormulaError(ERROR_CODES.ERR, 'Unexpected token value');
      }
      index += 1;
      return previous();
    }
  }

  function tokenize(input) {
    const tokens = [];
    let index = 0;

    while (index < input.length) {
      const char = input[index];

      if (/\s/.test(char)) {
        index += 1;
        continue;
      }

      const twoChar = input.slice(index, index + 2);
      if (['<>', '<=', '>='].includes(twoChar)) {
        tokens.push({ type: 'operator', value: twoChar });
        index += 2;
        continue;
      }

      if ('+-*/&=(),:<>'.includes(char)) {
        tokens.push({ type: 'operator', value: char });
        index += 1;
        continue;
      }

      if (char === '"') {
        let value = '';
        index += 1;
        while (index < input.length && input[index] !== '"') {
          value += input[index];
          index += 1;
        }
        if (input[index] !== '"') {
          throw new FormulaError(ERROR_CODES.ERR, 'Unterminated string');
        }
        index += 1;
        tokens.push({ type: 'string', value });
        continue;
      }

      const numberMatch = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)/);
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }

      const identMatch = input.slice(index).match(/^\$?[A-Z]+\$?\d+|^[A-Z_][A-Z0-9_]*/i);
      if (identMatch) {
        const value = identMatch[0].toUpperCase();
        if (value === 'TRUE' || value === 'FALSE') {
          tokens.push({ type: 'boolean', value: value === 'TRUE' });
        } else {
          tokens.push({ type: 'identifier', value });
        }
        index += identMatch[0].length;
        continue;
      }

      throw new FormulaError(ERROR_CODES.ERR, 'Unexpected character');
    }

    tokens.push({ type: 'eof', value: '' });
    return tokens;
  }

  function evaluateAst(node, context) {
    switch (node.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return node.value;
      case 'reference':
        return context.getCellValue(referenceToCellId(node.ref));
      case 'range':
        return context.getRangeValues(referenceToCellId(extractReference(node.start)), referenceToCellId(extractReference(node.end)));
      case 'unary':
        return node.operator === '-' ? -coerceNumber(evaluateAst(node.argument, context)) : coerceNumber(evaluateAst(node.argument, context));
      case 'binary':
        return evaluateBinary(node, context);
      case 'call':
        return evaluateFunction(node, context);
      default:
        throw new FormulaError(ERROR_CODES.ERR, 'Unknown AST node');
    }
  }

  function evaluateBinary(node, context) {
    if (node.operator === '&') {
      return coerceText(evaluateAst(node.left, context)) + coerceText(evaluateAst(node.right, context));
    }

    if (['=', '<>', '<', '<=', '>', '>='].includes(node.operator)) {
      const left = evaluateAst(node.left, context);
      const right = evaluateAst(node.right, context);
      switch (node.operator) {
        case '=': return left === right;
        case '<>': return left !== right;
        case '<': return left < right;
        case '<=': return left <= right;
        case '>': return left > right;
        case '>=': return left >= right;
      }
    }

    const left = coerceNumber(evaluateAst(node.left, context));
    const right = coerceNumber(evaluateAst(node.right, context));
    switch (node.operator) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/':
        if (right === 0) {
          throw new FormulaError(ERROR_CODES.DIV0);
        }
        return left / right;
      default:
        throw new FormulaError(ERROR_CODES.ERR, 'Unknown operator');
    }
  }

  function evaluateFunction(node, context) {
    const fn = FUNCTIONS[node.name];
    if (!fn) {
      throw new FormulaError(ERROR_CODES.NAME, 'Unknown function');
    }
    return fn(node.args.map((arg) => evaluateArgument(arg, context)));
  }

  function evaluateArgument(node, context) {
    if (node.type === 'range') {
      return evaluateAst(node, context);
    }
    return evaluateAst(node, context);
  }

  const FUNCTIONS = {
    SUM(args) {
      return flatten(args).reduce((sum, value) => sum + coerceNumber(value), 0);
    },
    AVERAGE(args) {
      const values = flatten(args).map(coerceNumber);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    },
    MIN(args) {
      const values = flatten(args).map(coerceNumber);
      return values.length ? Math.min(...values) : 0;
    },
    MAX(args) {
      const values = flatten(args).map(coerceNumber);
      return values.length ? Math.max(...values) : 0;
    },
    COUNT(args) {
      return flatten(args).filter((value) => typeof value === 'number' && !Number.isNaN(value)).length;
    },
    IF(args) {
      return coerceBoolean(args[0]) ? (args.length > 1 ? args[1] : '') : (args.length > 2 ? args[2] : '');
    },
    AND(args) {
      return flatten(args).every(coerceBoolean);
    },
    OR(args) {
      return flatten(args).some(coerceBoolean);
    },
    NOT(args) {
      return !coerceBoolean(args[0]);
    },
    ABS(args) {
      return Math.abs(coerceNumber(args[0]));
    },
    ROUND(args) {
      const value = coerceNumber(args[0]);
      const digits = args.length > 1 ? Math.trunc(coerceNumber(args[1])) : 0;
      const factor = 10 ** digits;
      return Math.round(value * factor) / factor;
    },
    CONCAT(args) {
      return flatten(args).map(coerceText).join('');
    },
  };

  function flatten(values) {
    const result = [];
    for (const value of values) {
      if (Array.isArray(value)) {
        result.push(...flatten(value));
      } else {
        result.push(value);
      }
    }
    return result;
  }

  function coerceNumber(value) {
    if (value === '') {
      return 0;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      throw new FormulaError(ERROR_CODES.ERR, 'Expected number');
    }
    return number;
  }

  function coerceText(value) {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function coerceBoolean(value) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return value !== '';
  }

  function extractReference(node) {
    if (node.type !== 'reference') {
      throw new FormulaError(ERROR_CODES.REF, 'Range endpoint must be a reference');
    }
    return node.ref;
  }

  function parseCellReferenceToken(token) {
    const match = token.match(/^(\$?)([A-Z]+)(\$?)(\d+)$/);
    if (!match) {
      throw new FormulaError(ERROR_CODES.REF, 'Invalid cell reference');
    }

    const row = Number(match[4]);
    const col = columnNameToNumber(match[2]);
    if (row < 1 || col < 1) {
      throw new FormulaError(ERROR_CODES.REF, 'Invalid cell reference');
    }

    return {
      colAbsolute: Boolean(match[1]),
      col,
      rowAbsolute: Boolean(match[3]),
      row,
    };
  }

  function referenceToCellId(ref) {
    return numberToColumnName(ref.col) + ref.row;
  }

  function normalizeCellId(cellId) {
    return referenceToCellId(parseCellReferenceToken(String(cellId).toUpperCase()));
  }

  function expandRange(startCellId, endCellId) {
    const startRef = parseCellReferenceToken(startCellId);
    const endRef = parseCellReferenceToken(endCellId);
    const minCol = Math.min(startRef.col, endRef.col);
    const maxCol = Math.max(startRef.col, endRef.col);
    const minRow = Math.min(startRef.row, endRef.row);
    const maxRow = Math.max(startRef.row, endRef.row);
    const ids = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        ids.push(numberToColumnName(col) + row);
      }
    }
    return ids;
  }

  function adjustFormulaReferences(formula, sourceCellId, destinationCellId) {
    if (!formula || formula[0] !== '=') {
      return formula;
    }

    const source = parseCellReferenceToken(normalizeCellId(sourceCellId));
    const destination = parseCellReferenceToken(normalizeCellId(destinationCellId));
    const rowOffset = destination.row - source.row;
    const colOffset = destination.col - source.col;

    return '=' + formula.slice(1).replace(/\$?[A-Z]+\$?\d+/g, (match) => {
      const ref = parseCellReferenceToken(match.toUpperCase());
      const nextRef = {
        colAbsolute: ref.colAbsolute,
        col: ref.colAbsolute ? ref.col : ref.col + colOffset,
        rowAbsolute: ref.rowAbsolute,
        row: ref.rowAbsolute ? ref.row : ref.row + rowOffset,
      };
      if (nextRef.col < 1 || nextRef.row < 1) {
        throw new FormulaError(ERROR_CODES.REF, 'Adjusted reference is out of bounds');
      }
      return serializeReference(nextRef);
    });
  }

  function serializeReference(ref) {
    return (ref.colAbsolute ? '$' : '') + numberToColumnName(ref.col) + (ref.rowAbsolute ? '$' : '') + ref.row;
  }

  function mapErrorCode(error) {
    if (error instanceof FormulaError) {
      return error.code;
    }
    return ERROR_CODES.ERR;
  }

  function compareCellIds(left, right) {
    const a = parseCellReferenceToken(left);
    const b = parseCellReferenceToken(right);
    return a.row - b.row || a.col - b.col;
  }

  function columnNameToNumber(name) {
    let value = 0;
    for (let index = 0; index < name.length; index += 1) {
      value = (value * 26) + (name.charCodeAt(index) - 64);
    }
    return value;
  }

  function numberToColumnName(number) {
    let value = number;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  const api = {
    ERROR_CODES,
    adjustFormulaReferences,
    createSheetEngine,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  globalScope.SpreadsheetFormulaEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
