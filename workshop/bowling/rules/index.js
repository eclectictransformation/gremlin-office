// Ruleset shelf. Add a new ruleset module next to tenpin.js and list it here;
// the screen picks it with ?rules=<id> and falls back to ten-pin.
import tenpin from "./tenpin.js";
export const RULESETS = { tenpin };
export function getRules(id) { return RULESETS[id] || tenpin; }
