(function () {
  var ROWS = 100;
  var COLS = 26;
  var STORAGE_PREFIX = (
    window.__BENCHMARK_STORAGE_NAMESPACE__ ||
    window.BENCHMARK_STORAGE_NAMESPACE ||
    window.benchmarkStorageNamespace ||
    "amazon-sheet"
  ) + ":";

  function colToName(index) {
    return String.fromCharCode(65 + index);
  }

  function coordToKey(row, col) {
    return colToName(col) + String(row + 1);
  }

  function keyToCoord(key) {
    var match = /^([A-Z])(\d+)$/.exec(String(key || "").toUpperCase());
    if (!match) {
      return null;
    }
    return {
      col: match[1].charCodeAt(0) - 65,
      row: Number(match[2]) - 1,
    };
  }

  function parseCellReference(ref) {
    var match = /^(\$?)([A-Z])(\$?)(\d+)$/.exec(String(ref || "").toUpperCase());
    if (!match) {
      return null;
    }
    return {
      colAbsolute: Boolean(match[1]),
      col: match[2].charCodeAt(0) - 65,
      rowAbsolute: Boolean(match[3]),
      row: Number(match[4]) - 1,
    };
  }

  function parseRangeAddress(rangeText) {
    var parts = String(rangeText || "").toUpperCase().split(":");
    var start = keyToCoord(parts[0]);
    var end = keyToCoord(parts[1] || parts[0]);
    if (!start || !end) {
      return null;
    }
    return {
      start: start,
      end: end,
      top: Math.min(start.row, end.row),
      bottom: Math.max(start.row, end.row),
      left: Math.min(start.col, end.col),
      right: Math.max(start.col, end.col),
      width: Math.abs(end.col - start.col) + 1,
      height: Math.abs(end.row - start.row) + 1,
    };
  }

  function shiftCellReference(ref, rowDelta, colDelta) {
    var parsed = parseCellReference(ref);
    if (!parsed) {
      return ref;
    }
    var nextCol = parsed.colAbsolute ? parsed.col : parsed.col + colDelta;
    var nextRow = parsed.rowAbsolute ? parsed.row : parsed.row + rowDelta;
    return (parsed.colAbsolute ? "$" : "") + colToName(clamp(nextCol, 0, COLS - 1)) + (parsed.rowAbsolute ? "$" : "") + String(clamp(nextRow, 0, ROWS - 1) + 1);
  }

  function shiftFormulaReferences(raw, rowDelta, colDelta) {
    if (!raw || raw[0] !== "=") {
      return raw;
    }
    return "=" + raw.slice(1).replace(/\$?[A-Z]\$?\d+/g, function (ref) {
      return shiftCellReference(ref, rowDelta, colDelta);
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function isNumberToken(raw) {
    return /^[-+]?\d+(\.\d+)?$/.test(raw.trim());
  }

  function toDisplayString(value) {
    if (value === null || value === undefined) {
      return "";
    }
    if (value === true) {
      return "TRUE";
    }
    if (value === false) {
      return "FALSE";
    }
    if (typeof value === "number") {
      if (!isFinite(value)) {
        return "#ERR!";
      }
      return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(10))).replace(/\.0+$/, "");
    }
    return String(value);
  }

  function toNumber(value) {
    if (Array.isArray(value)) {
      return toNumber(value[0] || 0);
    }
    if (value === true) {
      return 1;
    }
    if (value === false || value === "") {
      return 0;
    }
    if (typeof value === "number") {
      return value;
    }
    var parsed = Number(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }

  function toText(value) {
    if (Array.isArray(value)) {
      return value.map(toText).join("");
    }
    if (value === null || value === undefined) {
      return "";
    }
    if (value === true) {
      return "TRUE";
    }
    if (value === false) {
      return "FALSE";
    }
    return String(value);
  }

  function flattenArgs(values) {
    var flat = [];
    values.forEach(function (value) {
      if (Array.isArray(value)) {
        flat = flat.concat(flattenArgs(value));
      } else {
        flat.push(value);
      }
    });
    return flat;
  }

  function tokenize(source) {
    var tokens = [];
    var i = 0;

    while (i < source.length) {
      var ch = source[i];
      if (/\s/.test(ch)) {
        i += 1;
        continue;
      }
      if (ch === '"') {
        var value = "";
        i += 1;
        while (i < source.length && source[i] !== '"') {
          value += source[i];
          i += 1;
        }
        if (source[i] !== '"') {
          throw new Error("#ERR!");
        }
        i += 1;
        tokens.push({ type: "string", value: value });
        continue;
      }
      if (/[0-9.]/.test(ch)) {
        var numberText = ch;
        i += 1;
        while (i < source.length && /[0-9.]/.test(source[i])) {
          numberText += source[i];
          i += 1;
        }
        tokens.push({ type: "number", value: Number(numberText) });
        continue;
      }
      if (/[A-Za-z$]/.test(ch)) {
        var ident = ch;
        i += 1;
        while (i < source.length && /[A-Za-z0-9_$]/.test(source[i])) {
          ident += source[i];
          i += 1;
        }
        tokens.push({ type: "ident", value: ident.toUpperCase() });
        continue;
      }
      var pair = source.slice(i, i + 2);
      if (pair === "<=" || pair === ">=" || pair === "<>") {
        tokens.push({ type: "op", value: pair });
        i += 2;
        continue;
      }
      if ("+-*/&=() ,:<>".indexOf(ch) !== -1) {
        if (ch !== " ") {
          tokens.push({ type: ch === "," ? "comma" : ch === ":" ? "colon" : ch === "(" || ch === ")" ? "paren" : "op", value: ch });
        }
        i += 1;
        continue;
      }
      throw new Error("#ERR!");
    }

    return tokens;
  }

  function createWorkbook(initialCells) {
    var cells = Object.assign({}, initialCells || {});
    var clipboard = null;

    function parseLiteral(raw) {
      if (raw === "") {
        return "";
      }
      var trimmed = raw.trim();
      if (trimmed === "TRUE") {
        return true;
      }
      if (trimmed === "FALSE") {
        return false;
      }
      if (isNumberToken(raw)) {
        return Number(trimmed);
      }
      return raw;
    }

    function evaluateCell(key, stack) {
      var raw = cells[key] || "";
      if (raw === "") {
        return "";
      }
      if (raw[0] !== "=") {
        return parseLiteral(raw);
      }
      if (stack[key]) {
        throw new Error("#CIRC!");
      }
      stack[key] = true;
      try {
        return evaluateFormula(raw.slice(1), stack);
      } finally {
        delete stack[key];
      }
    }

    function resolveReference(ref, stack) {
      var cleaned = ref.replace(/\$/g, "");
      var coord = keyToCoord(cleaned);
      if (!coord) {
        throw new Error("#REF!");
      }
      return evaluateCell(coordToKey(coord.row, coord.col), stack);
    }

    function resolveRange(startRef, endRef, stack) {
      var start = keyToCoord(startRef.replace(/\$/g, ""));
      var end = keyToCoord(endRef.replace(/\$/g, ""));
      if (!start || !end) {
        throw new Error("#REF!");
      }
      var values = [];
      var top = Math.min(start.row, end.row);
      var bottom = Math.max(start.row, end.row);
      var left = Math.min(start.col, end.col);
      var right = Math.max(start.col, end.col);
      for (var row = top; row <= bottom; row += 1) {
        for (var col = left; col <= right; col += 1) {
          values.push(evaluateCell(coordToKey(row, col), stack));
        }
      }
      return values;
    }

    function callFunction(name, args) {
      var flat = flattenArgs(args);
      switch (name) {
        case "SUM":
          return flat.reduce(function (sum, value) { return sum + toNumber(value); }, 0);
        case "AVERAGE":
          return flat.length ? callFunction("SUM", flat) / flat.length : 0;
        case "MIN":
          return flat.length ? Math.min.apply(Math, flat.map(toNumber)) : 0;
        case "MAX":
          return flat.length ? Math.max.apply(Math, flat.map(toNumber)) : 0;
        case "COUNT":
          return flat.filter(function (value) { return value !== ""; }).length;
        case "IF":
          return args[0] ? args[1] : args[2];
        case "AND":
          return flat.every(Boolean);
        case "OR":
          return flat.some(Boolean);
        case "NOT":
          return !args[0];
        case "ABS":
          return Math.abs(toNumber(args[0]));
        case "ROUND":
          var digits = args[1] === undefined ? 0 : toNumber(args[1]);
          var factor = Math.pow(10, digits);
          return Math.round(toNumber(args[0]) * factor) / factor;
        case "CONCAT":
          return flat.map(toText).join("");
        default:
          throw new Error("#ERR!");
      }
    }

    function evaluateFormula(source, stack) {
      var tokens = tokenize(source);
      var position = 0;

      function peek() {
        return tokens[position];
      }

      function consume(expectedType, expectedValue) {
        var token = tokens[position];
        if (!token || token.type !== expectedType || (expectedValue && token.value !== expectedValue)) {
          throw new Error("#ERR!");
        }
        position += 1;
        return token;
      }

      function parseExpression() {
        return parseComparison();
      }

      function parseComparison() {
        var value = parseConcat();
        while (peek() && peek().type === "op" && ["=", "<>", "<", "<=", ">", ">="].indexOf(peek().value) !== -1) {
          var op = consume("op").value;
          var right = parseConcat();
          switch (op) {
            case "=":
              value = toText(value) === toText(right);
              break;
            case "<>":
              value = toText(value) !== toText(right);
              break;
            case "<":
              value = toNumber(value) < toNumber(right);
              break;
            case "<=":
              value = toNumber(value) <= toNumber(right);
              break;
            case ">":
              value = toNumber(value) > toNumber(right);
              break;
            case ">=":
              value = toNumber(value) >= toNumber(right);
              break;
          }
        }
        return value;
      }

      function parseConcat() {
        var value = parseAdditive();
        while (peek() && peek().type === "op" && peek().value === "&") {
          consume("op", "&");
          value = toText(value) + toText(parseAdditive());
        }
        return value;
      }

      function parseAdditive() {
        var value = parseMultiplicative();
        while (peek() && peek().type === "op" && (peek().value === "+" || peek().value === "-")) {
          var op = consume("op").value;
          var right = parseMultiplicative();
          value = op === "+" ? toNumber(value) + toNumber(right) : toNumber(value) - toNumber(right);
        }
        return value;
      }

      function parseMultiplicative() {
        var value = parseUnary();
        while (peek() && peek().type === "op" && (peek().value === "*" || peek().value === "/")) {
          var op = consume("op").value;
          var right = parseUnary();
          if (op === "/" && toNumber(right) === 0) {
            throw new Error("#DIV/0!");
          }
          value = op === "*" ? toNumber(value) * toNumber(right) : toNumber(value) / toNumber(right);
        }
        return value;
      }

      function parseUnary() {
        if (peek() && peek().type === "op" && peek().value === "-") {
          consume("op", "-");
          return -toNumber(parseUnary());
        }
        return parsePrimary();
      }

      function parsePrimary() {
        var token = peek();
        if (!token) {
          throw new Error("#ERR!");
        }
        if (token.type === "number") {
          consume("number");
          return token.value;
        }
        if (token.type === "string") {
          consume("string");
          return token.value;
        }
        if (token.type === "paren" && token.value === "(") {
          consume("paren", "(");
          var nested = parseExpression();
          consume("paren", ")");
          return nested;
        }
        if (token.type === "ident") {
          var ident = consume("ident").value;
          if (ident === "TRUE") {
            return true;
          }
          if (ident === "FALSE") {
            return false;
          }
          if (peek() && peek().type === "paren" && peek().value === "(") {
            consume("paren", "(");
            var args = [];
            if (!(peek() && peek().type === "paren" && peek().value === ")")) {
              do {
                args.push(parseExpression());
                if (!(peek() && peek().type === "comma")) {
                  break;
                }
                consume("comma", ",");
              } while (true);
            }
            consume("paren", ")");
            return callFunction(ident, args);
          }
          if (peek() && peek().type === "colon") {
            consume("colon", ":");
            var end = consume("ident").value;
            return resolveRange(ident, end, stack);
          }
          return resolveReference(ident, stack);
        }
        throw new Error("#ERR!");
      }

      var result = parseExpression();
      if (position !== tokens.length) {
        throw new Error("#ERR!");
      }
      return result;
    }

    return {
      getCells: function () {
        return Object.assign({}, cells);
      },
      setCell: function (key, raw) {
        var text = raw == null ? "" : String(raw);
        if (text === "") {
          delete cells[key];
          return;
        }
        cells[key] = text;
      },
      getRaw: function (key) {
        return cells[key] || "";
      },
      getValue: function (key) {
        try {
          return evaluateCell(key, {});
        } catch (error) {
          return error.message || "#ERR!";
        }
      },
      getDisplay: function (key) {
        return toDisplayString(this.getValue(key));
      },
      copyRange: function (rangeText) {
        var range = parseRangeAddress(rangeText);
        var data = [];
        if (!range) {
          return;
        }
        for (var row = 0; row < range.height; row += 1) {
          var rowValues = [];
          for (var col = 0; col < range.width; col += 1) {
            rowValues.push(this.getRaw(coordToKey(range.top + row, range.left + col)));
          }
          data.push(rowValues);
        }
        clipboard = {
          sourceTop: range.top,
          sourceLeft: range.left,
          width: range.width,
          height: range.height,
          data: data,
        };
      },
      pasteRange: function (destinationKey) {
        var destination = keyToCoord(destinationKey);
        if (!clipboard || !destination) {
          return;
        }
        for (var row = 0; row < clipboard.height; row += 1) {
          for (var col = 0; col < clipboard.width; col += 1) {
            var raw = clipboard.data[row][col];
            var nextKey = coordToKey(clamp(destination.row + row, 0, ROWS - 1), clamp(destination.col + col, 0, COLS - 1));
            var shifted = shiftFormulaReferences(raw, destination.row - clipboard.sourceTop, destination.col - clipboard.sourceLeft);
            this.setCell(nextKey, shifted);
          }
        }
      },
    };
  }

  function createApp() {
    if (window.__amazonSheetCleanup) {
      window.__amazonSheetCleanup();
      window.__amazonSheetCleanup = null;
    }

    var root = document.getElementById("spreadsheet");
    var formulaInput = document.getElementById("formula-input");
    if (!root || !formulaInput) {
      return;
    }

    var savedCells = {};
    try {
      savedCells = JSON.parse(localStorage.getItem(STORAGE_PREFIX + "cells") || "{}");
    } catch (error) {
      savedCells = {};
    }

    var workbook = createWorkbook(savedCells);
    var activeKey = localStorage.getItem(STORAGE_PREFIX + "active") || "A1";
    var editingKey = null;
    var draftValue = "";

    function save() {
      localStorage.setItem(STORAGE_PREFIX + "cells", JSON.stringify(workbook.getCells()));
      localStorage.setItem(STORAGE_PREFIX + "active", activeKey);
    }

    function render() {
      var table = document.createElement("table");
      table.className = "sheet-table";

      var headRow = document.createElement("tr");
      var corner = document.createElement("th");
      corner.className = "corner";
      headRow.appendChild(corner);

      for (var col = 0; col < COLS; col += 1) {
        var colHeader = document.createElement("th");
        colHeader.className = "col-header";
        colHeader.textContent = colToName(col);
        headRow.appendChild(colHeader);
      }
      table.appendChild(headRow);

      for (var row = 0; row < ROWS; row += 1) {
        var tr = document.createElement("tr");
        var rowHeader = document.createElement("th");
        rowHeader.className = "row-header";
        rowHeader.textContent = String(row + 1);
        tr.appendChild(rowHeader);

        for (var colIndex = 0; colIndex < COLS; colIndex += 1) {
          var key = coordToKey(row, colIndex);
          var td = document.createElement("td");
          td.className = "cell" + (key === activeKey ? " active" : "");
          var display = workbook.getDisplay(key);
          if (display[0] === "#") {
            td.className += " error";
          }
          td.dataset.key = key;

          if (editingKey === key) {
            var editor = document.createElement("input");
            editor.className = "cell-editor";
            editor.value = draftValue;
            editor.setAttribute("data-editor", key);
            td.appendChild(editor);
          } else {
            var button = document.createElement("button");
            button.type = "button";
            button.textContent = display;
            button.setAttribute("data-cell", key);
            button.setAttribute("aria-label", key);
            td.appendChild(button);
          }

          tr.appendChild(td);
        }
        table.appendChild(tr);
      }

      root.innerHTML = "";
      root.appendChild(table);
      formulaInput.value = editingKey ? draftValue : workbook.getRaw(activeKey);

      if (editingKey && editingKey !== "formula") {
        var activeEditor = root.querySelector('[data-editor="' + editingKey + '"]');
        if (activeEditor) {
          activeEditor.focus();
          activeEditor.setSelectionRange(activeEditor.value.length, activeEditor.value.length);
        }
      }
    }

    function moveSelection(rowDelta, colDelta) {
      var coord = keyToCoord(activeKey) || { row: 0, col: 0 };
      activeKey = coordToKey(clamp(coord.row + rowDelta, 0, ROWS - 1), clamp(coord.col + colDelta, 0, COLS - 1));
      editingKey = null;
      save();
      render();
    }

    function beginEdit(target, seed) {
      if (target === "formula") {
        editingKey = "formula";
        draftValue = seed != null ? seed : workbook.getRaw(activeKey);
        formulaInput.value = draftValue;
        formulaInput.focus();
        formulaInput.setSelectionRange(formulaInput.value.length, formulaInput.value.length);
        return;
      }
      editingKey = activeKey;
      draftValue = seed != null ? seed : workbook.getRaw(activeKey);
      render();
    }

    function commitEdit(moveAfter) {
      if (!editingKey) {
        return;
      }
      workbook.setCell(activeKey, draftValue);
      editingKey = null;
      save();
      render();
      if (moveAfter === "down") {
        moveSelection(1, 0);
      } else if (moveAfter === "right") {
        moveSelection(0, 1);
      }
    }

    function cancelEdit() {
      editingKey = null;
      draftValue = workbook.getRaw(activeKey);
      render();
    }

    function handleRootClick(event) {
      var cell = event.target.closest("[data-cell]");
      if (!cell) {
        return;
      }
      activeKey = cell.getAttribute("data-cell");
      editingKey = null;
      save();
      render();
    }

    function handleRootDoubleClick(event) {
      var cell = event.target.closest("[data-cell]");
      if (!cell) {
        return;
      }
      activeKey = cell.getAttribute("data-cell");
      beginEdit(activeKey);
    }

    function handleRootInput(event) {
      if (event.target.matches(".cell-editor")) {
        draftValue = event.target.value;
        formulaInput.value = draftValue;
      }
    }

    function handleRootKeydown(event) {
      if (!event.target.matches(".cell-editor")) {
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit("down");
      } else if (event.key === "Tab") {
        event.preventDefault();
        commitEdit("right");
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
      }
    }

    function handleFormulaFocus() {
      editingKey = "formula";
      draftValue = editingKey ? draftValue : workbook.getRaw(activeKey);
      formulaInput.value = draftValue;
    }

    function handleFormulaInput() {
      draftValue = formulaInput.value;
    }

    function handleFormulaKeydown(event) {
      if (event.key === "Enter") {
        event.preventDefault();
        commitEdit("down");
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelEdit();
      }
    }

    function handleDocumentKeydown(event) {
      var tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" && document.activeElement !== formulaInput && !document.activeElement.classList.contains("cell-editor")) {
        return;
      }
      if (editingKey && editingKey !== "formula") {
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "c") {
        event.preventDefault();
        workbook.copyRange(activeKey + ":" + activeKey);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        workbook.pasteRange(activeKey);
        save();
        render();
        return;
      }
      if (event.target === formulaInput && editingKey === "formula") {
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(-1, 0);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(1, 0);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveSelection(0, -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveSelection(0, 1);
      } else if (event.key === "Enter" || event.key === "F2") {
        event.preventDefault();
        beginEdit(activeKey);
      } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        beginEdit(activeKey, event.key);
      }
    }

    root.addEventListener("click", handleRootClick);
    root.addEventListener("dblclick", handleRootDoubleClick);
    root.addEventListener("input", handleRootInput);
    root.addEventListener("keydown", handleRootKeydown);
    formulaInput.addEventListener("focus", handleFormulaFocus);
    formulaInput.addEventListener("input", handleFormulaInput);
    formulaInput.addEventListener("keydown", handleFormulaKeydown);
    document.addEventListener("keydown", handleDocumentKeydown);

    window.__amazonSheetCleanup = function () {
      root.removeEventListener("click", handleRootClick);
      root.removeEventListener("dblclick", handleRootDoubleClick);
      root.removeEventListener("input", handleRootInput);
      root.removeEventListener("keydown", handleRootKeydown);
      formulaInput.removeEventListener("focus", handleFormulaFocus);
      formulaInput.removeEventListener("input", handleFormulaInput);
      formulaInput.removeEventListener("keydown", handleFormulaKeydown);
      document.removeEventListener("keydown", handleDocumentKeydown);
    };

    render();
  }

  window.SpreadsheetApp = {
    createWorkbook: createWorkbook,
    createApp: createApp,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createApp);
  } else {
    createApp();
  }
})();
