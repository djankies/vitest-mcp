#!/usr/bin/env node

import { handleRunTests } from './dist/tools/run-tests.js';

async function testStructuredOutput() {
  console.log('🔍 Testing Structured Output for LLM Consumption\n');
  
  const formats = ['summary', 'detailed', 'json'];
  
  for (const format of formats) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`FORMAT: ${format.toUpperCase()}`);
    console.log('='.repeat(60));
    
    try {
      const result = await handleRunTests({
        target: 'src/example.test.ts',
        format: format
      });
      
      console.log('\n📝 String Output (processedOutput):');
      console.log('-'.repeat(40));
      console.log(result.processedOutput.substring(0, 200) + '...');
      
      console.log('\n📊 Structured Data (result.structured):');
      console.log('-'.repeat(40));
      
      // Display structured data
      const structured = result.structured;
      
      console.log('Status:', structured.status);
      console.log('\nSummary:');
      console.log(`  Total Tests: ${structured.summary.total}`);
      console.log(`  Passed: ${structured.summary.passed}`);
      console.log(`  Failed: ${structured.summary.failed}`);
      console.log(`  Skipped: ${structured.summary.skipped}`);
      console.log(`  Duration: ${structured.summary.duration}ms`);
      console.log(`  Pass Rate: ${structured.summary.passRate}%`);
      
      if (structured.files && structured.files.length > 0) {
        console.log('\nTest Files:');
        structured.files.forEach(file => {
          console.log(`  📁 ${file.name} (${file.status})`);
          console.log(`     Duration: ${file.duration}ms`);
          console.log(`     Tests: ${file.tests.length}`);
          
          // Show first 2 tests as examples
          file.tests.slice(0, 2).forEach(test => {
            const icon = test.status === 'passed' ? '✅' : test.status === 'failed' ? '❌' : '⏭️';
            console.log(`       ${icon} ${test.name}`);
            if (test.error) {
              console.log(`          Error: ${test.error.message}`);
            }
          });
          
          if (file.tests.length > 2) {
            console.log(`       ... and ${file.tests.length - 2} more tests`);
          }
        });
      }
      
      if (structured.failures && structured.failures.length > 0) {
        console.log('\nFailure Summary:');
        structured.failures.forEach(failure => {
          console.log(`  ❌ ${failure.file} › ${failure.test}`);
          console.log(`     ${failure.error}`);
        });
      }
      
      if (structured.coverage) {
        console.log('\nCoverage:');
        console.log(`  Lines: ${structured.coverage.lines}%`);
        console.log(`  Functions: ${structured.coverage.functions}%`);
        console.log(`  Branches: ${structured.coverage.branches}%`);
        console.log(`  Statements: ${structured.coverage.statements}%`);
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Structured Output Test Complete!');
  console.log('\n🎯 Key Benefits for LLMs:');
  console.log('• Structured data is easily parseable');
  console.log('• Quick access to summary statistics');
  console.log('• Detailed test results when needed');
  console.log('• Failure information is organized');
  console.log('• Both human-readable strings and structured data available');
}

testStructuredOutput().catch(console.error);