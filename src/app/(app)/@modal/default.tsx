// No modal unless a route below matches. A link out of an open modal leaves
// it in this slot, so Modal hides itself once the URL moves on. (A catch-all
// here would also match /login and /setup, which live outside this layout.)
export default function NoModal() {
  return null;
}
