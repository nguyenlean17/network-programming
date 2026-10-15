// Original vector characters: crisp at every board size, no external image dependency.
const face = '<g fill="#503c48"><circle cx="26" cy="36" r="2"/><circle cx="38" cy="36" r="2"/></g><path d="M29 41q3 4 6 0" fill="none" stroke="#503c48" stroke-width="2" stroke-linecap="round"/><g fill="#ed9da9" opacity=".75"><ellipse cx="21" cy="40" rx="4" ry="2"/><ellipse cx="43" cy="40" rx="4" ry="2"/></g>';
const shapes = {
  ROCK: '<path d="M13 42V29q0-6 6-6h3v-5q0-5 5-5h12q6 0 6 6v7h2q5 0 5 6v11q0 10-11 10H25Q13 53 13 42Z" fill="var(--piece-fill)"/><path d="M23 24v7m9-15v12m9-11v12" fill="none"/>',
  PAPER: '<path d="M18 10h22l9 10v31q0 4-4 4H18q-4 0-4-4V14q0-4 4-4Z" fill="var(--piece-fill)"/><path d="M39 10v12h10M22 47h19" fill="none"/>',
  SCISSORS: '<path d="M23 31 16 13q-2-6 3-7 4-1 6 4l7 17 7-17q2-5 6-4 5 1 3 7l-8 19" fill="var(--piece-fill)"/><path d="M15 40q-2-10 7-13l9 1 11-1q10 1 9 12l-2 8q-2 9-13 9H28q-11 0-13-16Z" fill="var(--piece-fill)"/>'
};
export function pieceArt(type) {
  return `<svg class="piece-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g stroke="var(--piece-stroke)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${shapes[type] || shapes.ROCK}</g>${face}</svg>`;
}
