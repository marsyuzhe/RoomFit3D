export const jambMm = 35;
export function doorLeafWidth(width: number) {
  return Math.max(1, width - 2 * jambMm - 5);
}
