export type AxisSlice = { source: number; sourceSize: number; target: number; targetSize: number };

/** Stretch only the outermost image pixels into space outside the image. */
export function edgeSlices(sourceSize: number, start: number, size: number, viewport: number): AxisSlice[] {
  const slices: AxisSlice[] = [];
  if (start > 0) slices.push({ source: 0, sourceSize: 1, target: 0, targetSize: start });
  slices.push({ source: 0, sourceSize, target: start, targetSize: size });
  const end = start + size;
  if (end < viewport) slices.push({ source: sourceSize - 1, sourceSize: 1, target: end, targetSize: viewport - end });
  return slices;
}