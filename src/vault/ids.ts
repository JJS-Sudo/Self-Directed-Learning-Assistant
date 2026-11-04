const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Convention：`id` 是 6 位短随机串（如 `g7f3k2`），一旦写入不再复用 */
export const ID_LENGTH = 6

export function generateId(): string {
  let id = ''
  for (let index = 0; index < ID_LENGTH; index += 1) {
    id += ID_ALPHABET.charAt(Math.floor(Math.random() * ID_ALPHABET.length))
  }
  return id
}
