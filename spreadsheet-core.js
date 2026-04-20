const {
  evaluateCellInput,
  evaluateReference,
  normalizeReference,
} = require('./formula.js')

function indexToColumnLabel(index) {
  let value = index + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

function columnLabelToIndex(label) {
  let value = 0
  for (let index = 0; index < label.length; index += 1) {
    value = value * 26 + (label.charCodeAt(index) - 64)
  }
  return value - 1
}

function addressToPosition(address) {
  const normalized = normalizeReference(address)
  const match = normalized.match(/^([A-Z]+)([1-9][0-9]*)$/)
  if (!match) {
    throw new Error('Invalid address: ' + address)
  }
  return { row: Number(match[2]) - 1, col: columnLabelToIndex(match[1]) }
}

function positionToAddress(row, col) {
  return indexToColumnLabel(col) + String(row + 1)
}

function shiftReference(reference, rowOffset, colOffset) {
  return reference.replace(/(\$?)([A-Z]+)(\$?)([1-9][0-9]*)/g, function (_, colAbs, colLabel, rowAbs, rowText) {
    const nextCol = colAbs ? colLabel : indexToColumnLabel(columnLabelToIndex(colLabel) + colOffset)
    const nextRow = rowAbs ? rowText : String(Number(rowText) + rowOffset)
    return (colAbs ? '$' : '') + nextCol + (rowAbs ? '$' : '') + nextRow
  })
}

function copyFormula(raw, source, destination) {
  if (typeof raw !== 'string' || raw.charAt(0) !== '=') {
    return raw
  }
  return shiftReference(raw, destination.row - source.row, destination.col - source.col)
}

function createSheet() {
  const rawCells = new Map()

  return {
    setCell(address, raw) {
      const normalized = normalizeReference(address)
      if (raw == null || raw === '') {
        rawCells.delete(normalized)
      } else {
        rawCells.set(normalized, String(raw))
      }
    },

    getCell(address) {
      return rawCells.get(normalizeReference(address)) || ''
    },

    getComputedCell(address) {
      return evaluateReference(normalizeReference(address), {
        getCellInput(reference) {
          return rawCells.get(reference) || ''
        },
      })
    },

    serialize() {
      return Object.fromEntries(rawCells.entries())
    },
  }
}

function evaluateCell(sheet, address) {
  return sheet.getComputedCell(address)
}

function createSpreadsheetEngine(initialCells) {
  const sheet = createSheet()
  const clipboard = { matrix: null, source: null }
  let selection = { row: 0, col: 0 }

  if (initialCells) {
    for (const [address, raw] of Object.entries(initialCells)) {
      sheet.setCell(address, raw)
    }
  }

  return {
    setCell(address, raw) {
      sheet.setCell(address, raw)
    },

    getRawValue(address) {
      return sheet.getCell(address)
    },

    getDisplayValue(address) {
      return sheet.getComputedCell(address).display
    },

    getCell(address) {
      return sheet.getComputedCell(address)
    },

    setSelection(nextSelection) {
      selection = { row: nextSelection.row, col: nextSelection.col }
    },

    getSelection() {
      return { row: selection.row, col: selection.col }
    },

    serialize() {
      return JSON.stringify({ cells: sheet.serialize(), selection: selection })
    },

    deserialize(snapshot) {
      const data = typeof snapshot === 'string' ? JSON.parse(snapshot) : snapshot
      for (const key of Object.keys(sheet.serialize())) {
        sheet.setCell(key, '')
      }
      for (const [address, raw] of Object.entries(data.cells || {})) {
        sheet.setCell(address, raw)
      }
      if (data.selection) {
        selection = { row: data.selection.row, col: data.selection.col }
      }
    },

    copyRange(range) {
      const matrix = []
      for (let row = range.startRow; row <= range.endRow; row += 1) {
        const rowValues = []
        for (let col = range.startCol; col <= range.endCol; col += 1) {
          rowValues.push(sheet.getCell(positionToAddress(row, col)))
        }
        matrix.push(rowValues)
      }
      clipboard.matrix = matrix
      clipboard.source = { row: range.startRow, col: range.startCol }
    },

    pasteRange(target) {
      if (!clipboard.matrix) {
        return
      }
      for (let rowIndex = 0; rowIndex < clipboard.matrix.length; rowIndex += 1) {
        for (let colIndex = 0; colIndex < clipboard.matrix[rowIndex].length; colIndex += 1) {
          const raw = clipboard.matrix[rowIndex][colIndex]
          const destination = { row: target.row + rowIndex, col: target.col + colIndex }
          const source = { row: clipboard.source.row + rowIndex, col: clipboard.source.col + colIndex }
          sheet.setCell(positionToAddress(destination.row, destination.col), copyFormula(raw, source, destination))
        }
      }
    },
  }
}

module.exports = {
  addressToPosition,
  copyFormula,
  createSheet,
  createSpreadsheetEngine,
  evaluateCell,
  evaluateCellInput,
  indexToColumnLabel,
  positionToAddress,
}
