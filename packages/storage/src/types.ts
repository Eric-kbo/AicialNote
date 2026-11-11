/**
 * A storage backend is a tiny remote file system rooted at the vault folder.
 *
 * Paths are always relative, use "/" as separator and never start with "/".
 * Example: "items/01JC9Z….json".
 *
 * Every file carries an opaque `etag`. Writers pass the etag they last saw
 * (`ifMatch`) so a concurrent edit from another device is detected instead of
 * silently overwritten. `ifMatch: null` means "the file must not exist yet".
 */
export interface FileMeta {
  path: string
  name: string
  etag: string
  modifiedAt?: string
  size?: number
}

export interface ReadResult {
  text: string
  etag: string
}

export interface WriteOptions {
  /**
   * - `undefined`: unconditional write
   * - `null`: create only, fail with ConflictError if it already exists
   * - string: only overwrite if the current etag matches
   */
  ifMatch?: string | null
}

export interface StorageAdapter {
  /** Stable identifier, e.g. "google", "onedrive", "local", "memory". */
  readonly kind: string
  /** Non-recursive. Returns files only, never folders. Missing dir → []. */
  list(dir: string): Promise<FileMeta[]>
  /** Missing file → null. */
  read(path: string): Promise<ReadResult | null>
  /** Creates parent folders as needed. */
  write(path: string, text: string, options?: WriteOptions): Promise<FileMeta>
  /**
   * Removes a file. Cloud adapters move it to the provider's recycle bin, so a
   * removal is always recoverable by the user. Missing file is not an error.
   */
  remove(path: string): Promise<void>
}

export class StorageError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(message, options)
    this.name = 'StorageError'
  }
}

/** The file changed (or exists) on the remote, contrary to `ifMatch`. */
export class ConflictError extends StorageError {
  constructor(
    readonly path: string,
    readonly currentEtag?: string,
  ) {
    super(`Conflict writing ${path}`, 412)
    this.name = 'ConflictError'
  }
}

/** Credentials are missing or expired; the user has to sign in again. */
export class AuthError extends StorageError {
  constructor(message = 'Not authorized') {
    super(message, 401)
    this.name = 'AuthError'
  }
}

/** Signed in, but without permission to the files (a scope was declined at consent). */
export class ScopeError extends AuthError {
  constructor() {
    super('Missing permission to access files')
    this.name = 'ScopeError'
  }
}

export function splitPath(path: string): { dir: string; name: string } {
  const clean = normalizePath(path)
  const i = clean.lastIndexOf('/')
  return i === -1 ? { dir: '', name: clean } : { dir: clean.slice(0, i), name: clean.slice(i + 1) }
}

export function normalizePath(path: string): string {
  const parts = path.split('/').filter((p) => p !== '' && p !== '.')
  if (parts.some((p) => p === '..')) throw new StorageError(`Invalid path: ${path}`)
  return parts.join('/')
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'))
}
