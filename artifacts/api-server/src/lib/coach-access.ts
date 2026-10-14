/** Server-controlled owner identity; never accept roles from profile input. */
export function isCoach(id: string): boolean {
  const owner = process.env.COACH_REPLIT_USER_ID;
  return Boolean(owner && id === owner);
}
