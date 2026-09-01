#!/usr/bin/env node
import { run } from '../src/cli/index.js'

run().catch((error) => {
  console.error(`\n  llm-review: ${error.message}\n`)
  process.exit(1)
})
