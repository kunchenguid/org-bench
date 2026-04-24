/* eslint-disable no-console */
(function () {
  function assertEqual(actual, expected, label) {
    if (actual !== expected) {
      throw new Error(label + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  }

  function assertDeepEqual(actual, expected, label) {
    var a = JSON.stringify(actual);
    var e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(label + ': expected ' + e + ', got ' + a);
    }
  }

  function runFormulaEngineTests() {
    var engine = (typeof FormulaEngine !== 'undefined') ? FormulaEngine : require('./formula-engine.js');

    function make(values) {
      var sheet = engine.createSheet(values || {});
      engine.recalculate(sheet);
      return sheet;
    }

    var sheet = make({ A1: '2', A2: '3', A3: '=A1+A2*4', A4: '=-(A1+A2)', A5: '=(A1+A2)*4' });
    assertEqual(sheet.values.A3.display, 14, 'arithmetic precedence');
    assertEqual(sheet.values.A4.display, -5, 'unary minus');
    assertEqual(sheet.values.A5.display, 20, 'parentheses');

    sheet = make({ A1: '5', A2: '=A1>=5', A3: '=A1<>4', A4: '=A2=A3' });
    assertEqual(sheet.values.A2.display, true, 'greater-equal comparison');
    assertEqual(sheet.values.A3.display, true, 'not-equal comparison');
    assertEqual(sheet.values.A4.display, true, 'boolean equality comparison');

    sheet = make({ A1: 'Total', A2: '7', A3: '=A1&": "&A2', A4: 'TRUE', A5: '=IF(A4,"yes","no")' });
    assertEqual(sheet.values.A3.display, 'Total: 7', 'string concatenation');
    assertEqual(sheet.values.A4.display, true, 'boolean literal input');
    assertEqual(sheet.values.A5.display, 'yes', 'IF function');

    sheet = make({ A1: '1', A2: '2', B1: '3', B2: '4', C1: '=SUM(A1:B2)', C2: '=AVERAGE(A1:B2)', C3: '=MIN(A1:B2)', C4: '=MAX(A1:B2)', C5: '=COUNT(A1:B2)' });
    assertEqual(sheet.values.C1.display, 10, 'SUM range');
    assertEqual(sheet.values.C2.display, 2.5, 'AVERAGE range');
    assertEqual(sheet.values.C3.display, 1, 'MIN range');
    assertEqual(sheet.values.C4.display, 4, 'MAX range');
    assertEqual(sheet.values.C5.display, 4, 'COUNT range');

    sheet = make({ A1: '-2.4', A2: '=AND(TRUE,A1<0)', A3: '=OR(FALSE,A1>0)', A4: '=NOT(A3)', A5: '=ABS(A1)', A6: '=ROUND(2.345,2)', A7: '=CONCAT("A",1,"B")' });
    assertEqual(sheet.values.A2.display, true, 'AND function');
    assertEqual(sheet.values.A3.display, false, 'OR function');
    assertEqual(sheet.values.A4.display, true, 'NOT function');
    assertEqual(sheet.values.A5.display, 2.4, 'ABS function');
    assertEqual(sheet.values.A6.display, 2.35, 'ROUND function');
    assertEqual(sheet.values.A7.display, 'A1B', 'CONCAT function');

    sheet = make({ A1: '=Z99+1', A2: '="x"&Z99' });
    assertEqual(sheet.values.A1.display, 1, 'empty reference numeric context');
    assertEqual(sheet.values.A2.display, 'x', 'empty reference text context');

    sheet = make({ A1: '=B1', B1: '=A1', C1: '=1/0', C2: '=NOPE(1)', C3: '=A0' });
    assertEqual(sheet.values.A1.display, '#CIRC!', 'circular reference detected');
    assertEqual(sheet.values.B1.display, '#CIRC!', 'circular reference propagated');
    assertEqual(sheet.values.C1.display, '#DIV/0!', 'divide by zero error');
    assertEqual(sheet.values.C2.display, '#ERR!', 'unknown function error');
    assertEqual(sheet.values.C3.display, '#REF!', 'invalid reference error');

    sheet = make({ A1: '1', A2: '=A1+1', A3: '=A2+1' });
    assertDeepEqual(sheet.dependencies.A1.sort(), ['A2'], 'direct dependent recorded');
    assertDeepEqual(sheet.dependencies.A2.sort(), ['A3'], 'chained dependent recorded');
    engine.setCell(sheet, 'A1', '10');
    engine.recalculate(sheet);
    assertEqual(sheet.values.A3.display, 12, 'dependents recalculate after precedent change');

    assertEqual(engine.shiftFormula('=A1+$B$2+C$3+$D4+A1:B2', 'C3', 'D5'), '=B3+$B$2+D$3+$D6+B3:C4', 'relative refs shift on copy');

    console.log('FormulaEngine tests passed');
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = runFormulaEngineTests;
    if (require.main === module) runFormulaEngineTests();
  } else {
    window.runFormulaEngineTests = runFormulaEngineTests;
  }
}());
