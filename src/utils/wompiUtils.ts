export function getValueByPath(obj: any, path: string): string {
  const parts = path.split('.');
  let value = obj;

  for (const part of parts) {
    if (value == null || typeof value !== 'object') return '';
    value = value[part];
  }

  return typeof value === 'string' || typeof value === 'number' ? value.toString() : '';
}
