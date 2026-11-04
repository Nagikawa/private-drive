export type FileSort =
  | 'name-asc'
  | 'name-desc'
  | 'size-asc'
  | 'size-desc'
  | 'created-asc'
  | 'created-desc'
  | 'type-asc'
  | 'type-desc';

export const fileSorts: ReadonlyArray<FileSort> = [
  'name-asc',
  'name-desc',
  'size-asc',
  'size-desc',
  'created-asc',
  'created-desc',
  'type-asc',
  'type-desc',
];

// The select value is one token. The API wants the field and the direction separately.
export const parseFileSort = (value: FileSort): { sort: 'name' | 'size' | 'created' | 'type'; order: 'asc' | 'desc' } => {
  const [sort, order] = value.split('-');
  if (
    (sort === 'name' || sort === 'size' || sort === 'created' || sort === 'type') &&
    (order === 'asc' || order === 'desc')
  ) {
    return { sort, order };
  }
  return { sort: 'name', order: 'asc' };
};

export const isFileSort = (value: string): value is FileSort => fileSorts.some((item) => item === value);
