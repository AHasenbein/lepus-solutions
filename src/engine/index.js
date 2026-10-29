// Test entry point, not a barrel: do not import this from app code.
// Node >= 22 resolves `node --test src/engine/` as a module path (this file)
// rather than scanning the folder, so this loads the engine test suites.
// Equivalent: node --test 'src/engine/*.test.mjs'
import './allocate.test.mjs'
