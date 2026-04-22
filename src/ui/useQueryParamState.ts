import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

type Serializer<T> = (value: T) => string | null;
type Parser<T> = (raw: string | null) => T;

export function useQueryParamState<T>(
  key: string,
  {
    parse,
    serialize,
    defaultValue,
  }: {
    parse: Parser<T>;
    serialize: Serializer<T>;
    defaultValue: T;
  }
): [T, (next: T) => void] {
  const [params, setParams] = useSearchParams();

  const value = useMemo(() => parse(params.get(key)), [key, params, parse]);

  const setValue = useCallback(
    (next: T) => {
      const nextParams = new URLSearchParams(params);
      const encoded = serialize(next);
      if (encoded == null || encoded === '') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, encoded);
      }
      setParams(nextParams, { replace: true });
    },
    [key, params, serialize, setParams]
  );

  const resolvedValue = value ?? defaultValue;
  return [resolvedValue, setValue];
}

export const queryParsers = {
  string: (raw: string | null) => raw ?? '',
  number: (raw: string | null) => {
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  },
  boolean: (raw: string | null) => raw === '1' || raw === 'true',
};

export const querySerializers = {
  string: (value: string) => value.trim() || null,
  number: (value: number) => (Number.isFinite(value) ? String(value) : null),
  boolean: (value: boolean) => (value ? '1' : null),
};

