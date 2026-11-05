import qrcode from 'qrcode-generator';

export function traceModules(value: string) {
  const code = qrcode(0, 'M');
  code.addData(value, 'Byte');
  code.make();
  const size = code.getModuleCount();
  const cells: boolean[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) cells.push(code.isDark(row, column));
  }
  return { size, cells };
}
