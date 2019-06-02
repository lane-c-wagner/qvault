"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isElectronBased = isElectronBased;

function isElectronBased(framework) {
  return framework.name === "electron" || framework.name === "muon";
} 
// __ts-babel@6.0.4
//# sourceMappingURL=Framework.js.map