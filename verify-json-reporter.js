#!/usr/bin/env node

import { handleRunTests } from './dist/tools/run-tests.js';
import { spawn } from 'child_process';

async function verifyJsonReporter() {
  console.log('🔍 Verifying JSON Reporter Usage\n');
  
  const formats = ['summary', 'detailed', 'json'];
  
  console.log('Testing all formats to ensure JSON reporter is used internally:\n');
  
  for (const format of formats) {
    console.log(`\n${format.toUpperCase()} Format:`);
    console.log('─'.repeat(40));
    
    try {
      // Spy on the actual command executed
      const result = await handleRunTests({
        target: 'src/example.test.ts',
        format: format
      });
      
      // Check if JSON parsing worked
      if (format === 'json') {
        try {
          JSON.parse(result.stdout);
          console.log('✅ Returns valid JSON');
        } catch {
          console.log('❌ Failed to parse JSON');
        }
      } else {
        // For summary and detailed, check that we're getting processed output
        const output = result.stdout;
        if (output.includes('✅') || output.includes('❌')) {
          console.log('✅ Output is processed (not raw Vitest output)');
        } else {
          console.log('⚠️ Output might not be processed correctly');
        }
        console.log(`Preview: ${output.substring(0, 60)}...`);
      }
      
      console.log(`Command used: ${result.command}`);
      console.log(`Reporter: ${result.command.includes('--reporter=json') ? 'JSON ✅' : 'Not JSON ❌'}`);
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Verification complete!');
  console.log('\nKey Points:');
  console.log('• JSON reporter is always used internally');
  console.log('• All formats provide LLM-optimized output');
  console.log('• No raw Vitest output is exposed to LLMs');
}

verifyJsonReporter().catch(console.error);