/** Convert an operator-entered quantity to the API's exact integer thousandths. */
export function stockQuantityMilli(value: string, unit: string): string {
  const input = value.trim();
  if (!/^(0|[1-9]\d{0,8})(\.\d{1,3})?$/.test(input))
    throw new Error(
      'Enter a quantity between 0 and 999999999.999, using at most three decimal places.',
    );
  const [whole, fraction = ''] = input.split('.');
  const milli = BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0'));
  if (unit !== 'METERS' && milli % 1000n !== 0n)
    throw new Error('Pieces and units must be entered as whole quantities.');
  return milli.toString();
}
