export async function main(ns) {
  // Legacy shim: moved to /apps/gang/gang-review.js
  ns.run("/apps/gang/gang-review.js", 1, ...ns.args);
}
