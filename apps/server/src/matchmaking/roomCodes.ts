import { randomInt } from 'node:crypto';
import { NET, ROOM_CODE_ALPHABET } from '@highway-rush/shared';

export function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < NET.roomCodeLength; i++) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Picks a code that no live room is using. */
export async function allocateRoomCode(isTaken: (code: string) => Promise<boolean>): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateRoomCode();
    if (!(await isTaken(code))) return code;
  }
  throw new Error('Could not allocate a unique room code');
}
