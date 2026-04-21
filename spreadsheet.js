(function (root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  }
  root.SpreadsheetApp = exported;
})(typeof globalThis !== 'undefined' ? globalThis : window, function () {
  const ROW_COUNT = 100;
  const COLUMN_COUNT = 26;
  const EMPTY = Symbol('empty');

  function columnIndexToName(index) {
    let value = index + 1;
    let name = '';
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  function columnNameToIndex(name) {
    let index = 0;
    for (let i = 0; i < name.length; i += 1) {
      index = index * 26 + (name.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  function cellKeyFromCoords(row, col) {
    return columnIndexToName(col) + String(row + 1);
  }

  function coordsFromCellKey(cellKey) {
    const match = /^([A-Z]+)([1-9][0-9]*)$/.exec(cellKey);
    if (!match) {
      return null;
    }
    return {
      row: Number(match[2]) - 1,
      col: columnNameToIndex(match[1]),
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function makeError(code) {
    return { kind: 'error', code: code };
  }

  function isError(value) {
    return value && typeof value === 'object' && value.kind === 'error';
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
      if (char === '"') {
        let cursor = index + 1;
        let text = '';
        while (cursor < input.length && input[cursor] !== '"') {
          text += input[cursor];
          cursor += 1;
        }
        if (cursor >= input.length) {
          throw new Error('unterminated string');
        }
        tokens.push({ type: 'string', value: text });
        index = cursor + 1;
        continue;
      }
      const doubleOperator = input.slice(index, index + 2);
      if (doubleOperator === '<=' || doubleOperator === '>=' || doubleOperator === '<>') {
        tokens.push({ type: 'operator', value: doubleOperator });
        index += 2;
        continue;
      }
      if ('+-*/&=<>(),:'.includes(char)) {
        tokens.push({ type: char === '(' || char === ')' || char === ',' || char === ':' ? 'punctuation' : 'operator', value: char });
        index += 1;
        continue;
      }
      const numberMatch = /^\d+(?:\.\d+)?/.exec(input.slice(index));
      if (numberMatch) {
        tokens.push({ type: 'number', value: Number(numberMatch[0]) });
        index += numberMatch[0].length;
        continue;
      }
      const identifierMatch = /^\$?[A-Z]+\$?[1-9][0-9]*|^[A-Z_]+/.exec(input.slice(index).toUpperCase());
      if (identifierMatch) {
        tokens.push({ type: 'identifier', value: identifierMatch[0].toUpperCase() });
        index += identifierMatch[0].length;
        continue;
      }
      throw new Error('unexpected token');
    }
    return tokens;
  }

  function Parser(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  Parser.prototype.peek = function () {
    return this.tokens[this.index] || null;
  };

  Parser.prototype.consume = function () {
    const token = this.peek();
    this.index += 1;
    return token;
  };

  Parser.prototype.match = function (type, value) {
    const token = this.peek();
    if (!token) {
      return false;
    }
    if (token.type !== type) {
      return false;
    }
    if (value !== undefined && token.value !== value) {
      return false;
    }
    this.index += 1;
    return true;
  };

  Parser.prototype.expect = function (type, value) {
    const token = this.peek();
    if (!token || token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error('unexpected token');
    }
    this.index += 1;
    return token;
  };

  Parser.prototype.parse = function () {
    const expression = this.parseComparison();
    if (this.peek()) {
      throw new Error('trailing tokens');
    }
    return expression;
  };

  Parser.prototype.parseComparison = function () {
    let expression = this.parseConcat();
    while (this.peek() && this.peek().type === 'operator' && ['=', '<>', '<', '<=', '>', '>='].includes(this.peek().value)) {
      const operator = this.consume().value;
      const right = this.parseConcat();
      expression = { type: 'binary', operator: operator, left: expression, right: right };
    }
    return expression;
  };

  Parser.prototype.parseConcat = function () {
    let expression = this.parseAddSub();
    while (this.match('operator', '&')) {
      expression = { type: 'binary', operator: '&', left: expression, right: this.parseAddSub() };
    }
    return expression;
  };

  Parser.prototype.parseAddSub = function () {
    let expression = this.parseMulDiv();
    while (this.peek() && this.peek().type === 'operator' && (this.peek().value === '+' || this.peek().value === '-')) {
      const operator = this.consume().value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseMulDiv() };
    }
    return expression;
  };

  Parser.prototype.parseMulDiv = function () {
    let expression = this.parseUnary();
    while (this.peek() && this.peek().type === 'operator' && (this.peek().value === '*' || this.peek().value === '/')) {
      const operator = this.consume().value;
      expression = { type: 'binary', operator: operator, left: expression, right: this.parseUnary() };
    }
    return expression;
  };

  Parser.prototype.parseUnary = function () {
    if (this.match('operator', '-')) {
      return { type: 'unary', operator: '-', argument: this.parseUnary() };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function () {
    const token = this.peek();
    if (!token) {
      throw new Error('missing expression');
    }
    if (this.match('punctuation', '(')) {
      const expression = this.parseComparison();
      this.expect('punctuation', ')');
      return expression;
    }
    if (token.type === 'number') {
      this.consume();
      return { type: 'number', value: token.value };
    }
    if (token.type === 'string') {
      this.consume();
      return { type: 'string', value: token.value };
    }
    if (token.type === 'identifier') {
      this.consume();
      if (token.value === 'TRUE' || token.value === 'FALSE') {
        return { type: 'boolean', value: token.value === 'TRUE' };
      }
      if (this.match('punctuation', '(')) {
        const args = [];
        if (!this.match('punctuation', ')')) {
          do {
            args.push(this.parseComparison());
          } while (this.match('punctuation', ','));
          this.expect('punctuation', ')');
        }
        return { type: 'call', name: token.value, args: args };
      }
      const reference = parseReference(token.value);
      if (reference) {
        if (this.match('punctuation', ':')) {
          const endToken = this.expect('identifier');
          const endReference = parseReference(endToken.value);
          if (!endReference) {
            throw new Error('invalid range');
          }
          return { type: 'range', start: reference, end: endReference };
        }
        return { type: 'reference', reference: reference };
      }
      return { type: 'name', value: token.value };
    }
    throw new Error('invalid expression');
  };

  function parseReference(tokenValue) {
    const match = /^(\$?)([A-Z]+)(\$?)([1-9][0-9]*)$/.exec(tokenValue);
    if (!match) {
      return null;
    }
    return {
      colAbsolute: Boolean(match[1]),
      col: columnNameToIndex(match[2]),
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function parseFormula(input) {
    const parser = new Parser(tokenize(input));
    return parser.parse();
  }

  function coerceNumber(value) {
    if (value === EMPTY) {
      return 0;
    }
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function coerceString(value) {
    if (value === EMPTY) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    return String(value);
  }

  function coerceBoolean(value) {
    if (value === EMPTY) {
      return false;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return String(value).length > 0;
  }

  function compareValues(left, right, operator) {
    const leftValue = typeof left === 'string' || typeof right === 'string' ? coerceString(left) : coerceNumber(left);
    const rightValue = typeof left === 'string' || typeof right === 'string' ? coerceString(right) : coerceNumber(right);
    switch (operator) {
      case '=':
        return leftValue === rightValue;
      case '<>':
        return leftValue !== rightValue;
      case '<':
        return leftValue < rightValue;
      case '<=':
        return leftValue <= rightValue;
      case '>':
        return leftValue > rightValue;
      case '>=':
        return leftValue >= rightValue;
      default:
        return makeError('#ERR!');
    }
  }

  function flattenValues(items) {
    const values = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (Array.isArray(item)) {
        values.push.apply(values, flattenValues(item));
      } else {
        values.push(item);
      }
    }
    return values;
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) {
      return String(value);
    }
    return String(Number(value.toFixed(8)));
  }

  function formatValue(value) {
    if (isError(value)) {
      return value.code;
    }
    if (value === EMPTY) {
      return '';
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (typeof value === 'number') {
      return formatNumber(value);
    }
    return String(value);
  }

  function SpreadsheetModel(serialized) {
    this.cells = {};
    this.selection = { row: 0, col: 0 };
    if (serialized) {
      this.load(serialized);
    }
  }

  SpreadsheetModel.prototype.load = function (serialized) {
    this.cells = serialized.cells ? clone(serialized.cells) : {};
    if (serialized.selection) {
      this.selection = {
        row: clamp(serialized.selection.row || 0, 0, ROW_COUNT - 1),
        col: clamp(serialized.selection.col || 0, 0, COLUMN_COUNT - 1),
      };
    }
  };

  SpreadsheetModel.prototype.serialize = function () {
    return {
      cells: clone(this.cells),
      selection: { row: this.selection.row, col: this.selection.col },
    };
  };

  SpreadsheetModel.prototype.getRaw = function (cellKey) {
    return Object.prototype.hasOwnProperty.call(this.cells, cellKey) ? this.cells[cellKey] : '';
  };

  SpreadsheetModel.prototype.setCell = function (cellKey, rawValue) {
    if (rawValue === '') {
      delete this.cells[cellKey];
      return;
    }
    this.cells[cellKey] = rawValue;
  };

  SpreadsheetModel.prototype.getDisplayValue = function (cellKey) {
    return formatValue(this.evaluateCell(cellKey, { cache: {}, stack: [] }));
  };

  SpreadsheetModel.prototype.evaluateCell = function (cellKey, context) {
    const current = context || { cache: {}, stack: [] };
    if (current.cache[cellKey] !== undefined) {
      return current.cache[cellKey];
    }
    if (current.stack.includes(cellKey)) {
      return makeError('#CIRC!');
    }
    current.stack.push(cellKey);
    const rawValue = this.getRaw(cellKey);
    let result;
    if (rawValue === '') {
      result = EMPTY;
    } else if (rawValue[0] === '=') {
      try {
        const ast = parseFormula(rawValue.slice(1));
        result = this.evaluateExpression(ast, current);
      } catch (error) {
        result = makeError('#ERR!');
      }
    } else {
      const numeric = Number(rawValue);
      result = rawValue.trim() !== '' && Number.isFinite(numeric) ? numeric : rawValue;
    }
    current.stack.pop();
    current.cache[cellKey] = result;
    return result;
  };

  SpreadsheetModel.prototype.evaluateExpression = function (expression, context) {
    switch (expression.type) {
      case 'number':
      case 'string':
      case 'boolean':
        return expression.value;
      case 'reference':
        return this.getReferenceValue(expression.reference, context);
      case 'range':
        return this.getRangeValues(expression.start, expression.end, context);
      case 'name':
        return makeError('#ERR!');
      case 'unary': {
        const value = this.evaluateExpression(expression.argument, context);
        if (isError(value)) {
          return value;
        }
        return -coerceNumber(value);
      }
      case 'binary': {
        const left = this.evaluateExpression(expression.left, context);
        const right = this.evaluateExpression(expression.right, context);
        if (isError(left)) {
          return left;
        }
        if (isError(right)) {
          return right;
        }
        switch (expression.operator) {
          case '+':
            return coerceNumber(left) + coerceNumber(right);
          case '-':
            return coerceNumber(left) - coerceNumber(right);
          case '*':
            return coerceNumber(left) * coerceNumber(right);
          case '/':
            if (coerceNumber(right) === 0) {
              return makeError('#DIV/0!');
            }
            return coerceNumber(left) / coerceNumber(right);
          case '&':
            return coerceString(left) + coerceString(right);
          default:
            return compareValues(left, right, expression.operator);
        }
      }
      case 'call':
        return this.evaluateCall(expression.name, expression.args, context);
      default:
        return makeError('#ERR!');
    }
  };

  SpreadsheetModel.prototype.getReferenceValue = function (reference, context) {
    if (reference.row < 0 || reference.col < 0 || reference.col >= COLUMN_COUNT) {
      return makeError('#REF!');
    }
    const key = cellKeyFromCoords(reference.row, reference.col);
    return this.evaluateCell(key, context);
  };

  SpreadsheetModel.prototype.getRangeValues = function (start, end, context) {
    const minRow = Math.min(start.row, end.row);
    const maxRow = Math.max(start.row, end.row);
    const minCol = Math.min(start.col, end.col);
    const maxCol = Math.max(start.col, end.col);
    const values = [];
    for (let row = minRow; row <= maxRow; row += 1) {
      for (let col = minCol; col <= maxCol; col += 1) {
        values.push(this.evaluateCell(cellKeyFromCoords(row, col), context));
      }
    }
    return values;
  };

  SpreadsheetModel.prototype.evaluateCall = function (name, args, context) {
    const evaluated = [];
    for (let i = 0; i < args.length; i += 1) {
      const value = this.evaluateExpression(args[i], context);
      if (isError(value)) {
        return value;
      }
      evaluated.push(value);
    }
    const flat = flattenValues(evaluated).filter(function (value) {
      return !isError(value);
    });
    switch (name) {
      case 'SUM':
        return flat.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0);
      case 'AVERAGE': {
        const items = flat.filter(function (value) { return value !== EMPTY; });
        if (items.length === 0) {
          return 0;
        }
        return items.reduce(function (sum, value) { return sum + coerceNumber(value); }, 0) / items.length;
      }
      case 'MIN':
        return flat.length ? Math.min.apply(null, flat.map(coerceNumber)) : 0;
      case 'MAX':
        return flat.length ? Math.max.apply(null, flat.map(coerceNumber)) : 0;
      case 'COUNT':
        return flat.filter(function (value) { return value !== EMPTY && Number.isFinite(Number(value)); }).length;
      case 'IF':
        return coerceBoolean(evaluated[0]) ? (evaluated[1] === undefined ? EMPTY : evaluated[1]) : (evaluated[2] === undefined ? EMPTY : evaluated[2]);
      case 'AND':
        return flat.every(coerceBoolean);
      case 'OR':
        return flat.some(coerceBoolean);
      case 'NOT':
        return !coerceBoolean(evaluated[0]);
      case 'ABS':
        return Math.abs(coerceNumber(evaluated[0]));
      case 'ROUND': {
        const decimals = evaluated[1] === undefined ? 0 : coerceNumber(evaluated[1]);
        const factor = Math.pow(10, decimals);
        return Math.round(coerceNumber(evaluated[0]) * factor) / factor;
      }
      case 'CONCAT':
        return flat.map(coerceString).join('');
      default:
        return makeError('#ERR!');
    }
  };

  function createStorageAdapter(namespace) {
    const prefix = namespace || 'spreadsheet:';
    const key = prefix + 'state';
    return {
      load: function () {
        if (typeof localStorage === 'undefined') {
          return null;
        }
        const raw = localStorage.getItem(key);
        if (!raw) {
          return null;
        }
        try {
          return JSON.parse(raw);
        } catch (error) {
          return null;
        }
      },
      save: function (value) {
        if (typeof localStorage === 'undefined') {
          return;
        }
        localStorage.setItem(key, JSON.stringify(value));
      },
    };
  }

  function createSpreadsheetApp(options) {
    const settings = options || {};
    const model = settings.model || new SpreadsheetModel(settings.initialState);
    const storage = settings.storage || createStorageAdapter(settings.storageNamespace);
    const root = settings.root;
    let editing = null;

    function save() {
      storage.save(model.serialize());
    }

    function moveSelection(rowDelta, colDelta) {
      model.selection = {
        row: clamp(model.selection.row + rowDelta, 0, ROW_COUNT - 1),
        col: clamp(model.selection.col + colDelta, 0, COLUMN_COUNT - 1),
      };
      save();
      render();
    }

    function commitEdit(nextRaw, moveAfter) {
      const key = cellKeyFromCoords(model.selection.row, model.selection.col);
      model.setCell(key, nextRaw);
      editing = null;
      if (moveAfter) {
        moveSelection(moveAfter.row, moveAfter.col);
      } else {
        save();
        render();
      }
    }

    function beginEdit(replace) {
      const key = cellKeyFromCoords(model.selection.row, model.selection.col);
      editing = {
        value: replace ? '' : model.getRaw(key),
      };
      render();
      const input = root.querySelector('.cell-editor');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }

    function renderCell(td, row, col) {
      const key = cellKeyFromCoords(row, col);
      const selected = row === model.selection.row && col === model.selection.col;
      td.className = 'grid-cell' + (selected ? ' is-selected' : '');
      td.dataset.cell = key;
      td.textContent = model.getDisplayValue(key);
      if (selected && editing) {
        td.innerHTML = '';
        const input = document.createElement('input');
        input.className = 'cell-editor';
        input.value = editing.value;
        input.addEventListener('input', function (event) {
          editing.value = event.target.value;
          formulaInput.value = editing.value;
        });
        input.addEventListener('keydown', function (event) {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitEdit(editing.value, { row: 1, col: 0 });
          } else if (event.key === 'Tab') {
            event.preventDefault();
            commitEdit(editing.value, { row: 0, col: 1 });
          } else if (event.key === 'Escape') {
            event.preventDefault();
            editing = null;
            render();
          }
        });
        td.appendChild(input);
      }
    }

    root.innerHTML = [
      '<div class="app-shell">',
      '  <div class="toolbar">',
      '    <div class="name-box"></div>',
      '    <label class="formula-wrap"><span>fx</span><input class="formula-input" type="text" spellcheck="false"></label>',
      '  </div>',
      '  <div class="grid-wrap">',
      '    <table class="grid-table">',
      '      <thead><tr><th class="corner"></th></tr></thead>',
      '      <tbody></tbody>',
      '    </table>',
      '  </div>',
      '</div>',
    ].join('');

    const headRow = root.querySelector('thead tr');
    const body = root.querySelector('tbody');
    const formulaInput = root.querySelector('.formula-input');
    const nameBox = root.querySelector('.name-box');

    for (let col = 0; col < COLUMN_COUNT; col += 1) {
      const th = document.createElement('th');
      th.className = 'column-header';
      th.textContent = columnIndexToName(col);
      headRow.appendChild(th);
    }

    for (let row = 0; row < ROW_COUNT; row += 1) {
      const tr = document.createElement('tr');
      const header = document.createElement('th');
      header.className = 'row-header';
      header.textContent = String(row + 1);
      tr.appendChild(header);
      for (let col = 0; col < COLUMN_COUNT; col += 1) {
        const td = document.createElement('td');
        td.addEventListener('click', function () {
          model.selection = { row: row, col: col };
          editing = null;
          save();
          render();
        });
        td.addEventListener('dblclick', function () {
          model.selection = { row: row, col: col };
          beginEdit(false);
        });
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }

    formulaInput.addEventListener('focus', function () {
      editing = { value: model.getRaw(cellKeyFromCoords(model.selection.row, model.selection.col)) };
      render();
      formulaInput.focus();
    });

    formulaInput.addEventListener('input', function (event) {
      editing = { value: event.target.value };
      const editor = root.querySelector('.cell-editor');
      if (editor) {
        editor.value = editing.value;
      }
    });

    formulaInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        commitEdit(formulaInput.value, { row: 1, col: 0 });
      } else if (event.key === 'Tab') {
        event.preventDefault();
        commitEdit(formulaInput.value, { row: 0, col: 1 });
      } else if (event.key === 'Escape') {
        event.preventDefault();
        editing = null;
        render();
      }
    });

    root.addEventListener('keydown', function (event) {
      const activeTag = document.activeElement && document.activeElement.tagName;
      if (activeTag === 'INPUT' && document.activeElement !== root) {
        return;
      }
      if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        beginEdit(true);
        const input = root.querySelector('.cell-editor');
        if (input) {
          input.value = event.key;
          editing.value = event.key;
          formulaInput.value = event.key;
        }
        return;
      }
      if (event.key === 'Enter' || event.key === 'F2') {
        event.preventDefault();
        beginEdit(false);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        moveSelection(-1, 0);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        moveSelection(1, 0);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        moveSelection(0, -1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        moveSelection(0, 1);
      }
    });

    function render() {
      nameBox.textContent = cellKeyFromCoords(model.selection.row, model.selection.col);
      formulaInput.value = editing ? editing.value : model.getRaw(cellKeyFromCoords(model.selection.row, model.selection.col));
      const rows = body.children;
      for (let row = 0; row < ROW_COUNT; row += 1) {
        const cells = rows[row].children;
        for (let col = 0; col < COLUMN_COUNT; col += 1) {
          renderCell(cells[col + 1], row, col);
        }
      }
    }

    render();

    return {
      model: model,
      render: render,
      save: save,
    };
  }

  function boot() {
    if (typeof document === 'undefined') {
      return null;
    }
    const root = document.getElementById('app');
    if (!root) {
      return null;
    }
    const namespace = (typeof window !== 'undefined' && window.__BENCHMARK_STORAGE_NAMESPACE__) || 'spreadsheet:';
    const storage = createStorageAdapter(namespace + ':');
    const savedState = storage.load();
    return createSpreadsheetApp({
      root: root,
      storage: storage,
      initialState: savedState,
      storageNamespace: namespace + ':',
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', boot);
    } else {
      boot();
    }
  }

  return {
    SpreadsheetModel: SpreadsheetModel,
    ROW_COUNT: ROW_COUNT,
    COLUMN_COUNT: COLUMN_COUNT,
    parseFormula: parseFormula,
    createSpreadsheetApp: createSpreadsheetApp,
    createStorageAdapter: createStorageAdapter,
    columnIndexToName: columnIndexToName,
    columnNameToIndex: columnNameToIndex,
    cellKeyFromCoords: cellKeyFromCoords,
    coordsFromCellKey: coordsFromCellKey,
  };
});
