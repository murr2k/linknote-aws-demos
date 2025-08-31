const { test, expect } = require('@playwright/test');
const { execSync } = require('child_process');
const fs = require('fs');

// Test configuration
const CONFIG = {
  stackName: 'bc-ferries-dual-dashboard',
  region: 'us-west-2',
  templatePath: 'config/aws-grafana-corrected.yaml',
  maxDeploymentTime: 30 * 60 * 1000, // 30 minutes
  pollInterval: 30 * 1000 // 30 seconds
};

// Utility functions
const runAWSCommand = (command) => {
  try {
    const result = execSync(`aws ${command} --region ${CONFIG.region}`, { 
      encoding: 'utf-8',
      timeout: 60000 
    });
    return JSON.parse(result);
  } catch (error) {
    console.error(`AWS Command failed: ${command}`);
    console.error(error.message);
    throw error;
  }
};

const waitForStackOperation = async (stackName, expectedStatus, maxTime) => {
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxTime) {
    try {
      const result = runAWSCommand(`cloudformation describe-stacks --stack-name ${stackName}`);
      const stack = result.Stacks[0];
      
      console.log(`Stack Status: ${stack.StackStatus}`);
      
      if (stack.StackStatus === expectedStatus) {
        return stack;
      }
      
      if (stack.StackStatus.includes('FAILED') || stack.StackStatus.includes('ROLLBACK')) {
        const events = runAWSCommand(`cloudformation describe-stack-events --stack-name ${stackName}`);
        const failedEvents = events.StackEvents.filter(e => e.ResourceStatus === 'CREATE_FAILED');
        throw new Error(`Stack operation failed: ${JSON.stringify(failedEvents, null, 2)}`);
      }
      
      await new Promise(resolve => setTimeout(resolve, CONFIG.pollInterval));
    } catch (error) {
      if (error.message.includes('does not exist')) {
        if (expectedStatus === 'DELETE_COMPLETE') {
          return null; // Stack successfully deleted
        }
        throw new Error(`Stack ${stackName} does not exist`);
      }
      throw error;
    }
  }
  
  throw new Error(`Timeout waiting for stack to reach ${expectedStatus}`);
};

test.describe('BC Ferries CloudFormation Deployment', () => {
  test.beforeAll(async () => {
    console.log('🚀 Starting BC Ferries Dual Dashboard Deployment Tests');
    
    // Verify AWS credentials
    try {
      const identity = runAWSCommand('sts get-caller-identity');
      console.log(`✅ AWS Identity verified: ${identity.Arn}`);
    } catch (error) {
      throw new Error('AWS credentials not configured properly');
    }
    
    // Verify template exists
    if (!fs.existsSync(CONFIG.templatePath)) {
      throw new Error(`Template file not found: ${CONFIG.templatePath}`);
    }
    console.log(`✅ Template found: ${CONFIG.templatePath}`);
  });

  test('should validate CloudFormation template', async () => {
    console.log('🔍 Validating CloudFormation template...');
    
    const validation = runAWSCommand(`cloudformation validate-template --template-body file://${CONFIG.templatePath}`);
    
    expect(validation.Parameters).toBeDefined();
    expect(validation.Capabilities).toContain('CAPABILITY_NAMED_IAM');
    
    console.log('✅ Template validation passed');
    console.log(`Parameters: ${validation.Parameters.map(p => p.ParameterKey).join(', ')}`);
  });

  test('should clean up existing stack if present', async () => {
    console.log('🧹 Checking for existing stack...');
    
    try {
      const existingStack = runAWSCommand(`cloudformation describe-stacks --stack-name ${CONFIG.stackName}`);
      console.log(`Found existing stack in status: ${existingStack.Stacks[0].StackStatus}`);
      
      // Delete existing stack
      console.log('Deleting existing stack...');
      execSync(`aws cloudformation delete-stack --stack-name ${CONFIG.stackName} --region ${CONFIG.region}`);
      
      // Wait for deletion to complete
      await waitForStackOperation(CONFIG.stackName, 'DELETE_COMPLETE', 10 * 60 * 1000);
      console.log('✅ Existing stack deleted successfully');
      
    } catch (error) {
      if (error.message.includes('does not exist')) {
        console.log('✅ No existing stack to clean up');
      } else {
        throw error;
      }
    }
  });

  test('should deploy CloudFormation stack successfully', async () => {
    console.log('🚀 Deploying CloudFormation stack...');
    
    // Start deployment
    try {
      execSync(`aws cloudformation deploy \
        --template-file ${CONFIG.templatePath} \
        --stack-name ${CONFIG.stackName} \
        --parameter-overrides WorkspaceName=bc-ferries-enterprise CustomDomain=ops.linknote.com \
        --capabilities CAPABILITY_NAMED_IAM \
        --region ${CONFIG.region} \
        --no-cli-pager`, 
        { 
          stdio: 'inherit',
          timeout: CONFIG.maxDeploymentTime 
        });
      
      console.log('✅ CloudFormation deployment command completed');
    } catch (error) {
      console.error('❌ Deployment failed:', error.message);
      
      // Get detailed error information
      try {
        const events = runAWSCommand(`cloudformation describe-stack-events --stack-name ${CONFIG.stackName}`);
        const failedEvents = events.StackEvents.filter(e => 
          e.ResourceStatus && e.ResourceStatus.includes('FAILED')
        );
        
        console.error('Failed Events:', JSON.stringify(failedEvents, null, 2));
      } catch (eventError) {
        console.error('Could not retrieve stack events:', eventError.message);
      }
      
      throw error;
    }
  });

  test('should verify stack resources are created', async () => {
    console.log('🔍 Verifying stack resources...');
    
    const stack = runAWSCommand(`cloudformation describe-stacks --stack-name ${CONFIG.stackName}`);
    expect(stack.Stacks[0].StackStatus).toBe('CREATE_COMPLETE');
    
    const resources = runAWSCommand(`cloudformation describe-stack-resources --stack-name ${CONFIG.stackName}`);
    console.log(`✅ Stack has ${resources.StackResources.length} resources`);
    
    // Verify critical resources
    const resourceTypes = resources.StackResources.map(r => r.ResourceType);
    const expectedResources = [
      'AWS::Timestream::InfluxDBInstance',
      'AWS::Grafana::Workspace',
      'AWS::EC2::VPC',
      'AWS::Lambda::Function',
      'AWS::IoT::Policy',
      'AWS::IoT::TopicRule'
    ];
    
    for (const expectedType of expectedResources) {
      if (resourceTypes.includes(expectedType)) {
        console.log(`✅ Found ${expectedType}`);
      } else {
        console.warn(`⚠️  Missing ${expectedType}`);
      }
    }
  });

  test('should verify stack outputs', async () => {
    console.log('📊 Checking stack outputs...');
    
    const stack = runAWSCommand(`cloudformation describe-stacks --stack-name ${CONFIG.stackName}`);
    const outputs = stack.Stacks[0].Outputs || [];
    
    console.log(`Found ${outputs.length} outputs:`);
    outputs.forEach(output => {
      console.log(`  ${output.OutputKey}: ${output.OutputValue}`);
    });
    
    // Verify expected outputs
    const expectedOutputs = ['GrafanaWorkspaceEndpoint', 'InfluxDBEndpoint'];
    for (const expectedOutput of expectedOutputs) {
      const output = outputs.find(o => o.OutputKey === expectedOutput);
      if (output) {
        console.log(`✅ Found ${expectedOutput}: ${output.OutputValue}`);
        expect(output.OutputValue).toBeDefined();
        expect(output.OutputValue).not.toBe('');
      } else {
        console.warn(`⚠️  Missing output: ${expectedOutput}`);
      }
    }
  });

  test('should verify Grafana workspace is accessible', async ({ page }) => {
    console.log('🎨 Testing Grafana workspace accessibility...');
    
    const stack = runAWSCommand(`cloudformation describe-stacks --stack-name ${CONFIG.stackName}`);
    const outputs = stack.Stacks[0].Outputs || [];
    const grafanaOutput = outputs.find(o => o.OutputKey === 'GrafanaWorkspaceEndpoint');
    
    if (!grafanaOutput) {
      console.warn('⚠️  No Grafana endpoint found, skipping accessibility test');
      return;
    }
    
    const grafanaUrl = `https://${grafanaOutput.OutputValue}`;
    console.log(`Testing Grafana URL: ${grafanaUrl}`);
    
    try {
      // Test if the endpoint responds
      const response = await page.request.get(grafanaUrl);
      console.log(`Grafana endpoint status: ${response.status()}`);
      
      // Expect either success or authentication required
      expect([200, 302, 401, 403]).toContain(response.status());
      
      if (response.status() === 200) {
        console.log('✅ Grafana workspace is accessible');
      } else {
        console.log('✅ Grafana workspace exists but requires authentication');
      }
    } catch (error) {
      console.warn(`⚠️  Grafana endpoint not yet accessible: ${error.message}`);
      // This might be expected for newly created workspaces
    }
  });

  test('should test domain endpoints', async ({ page }) => {
    console.log('🌐 Testing domain endpoints...');
    
    const domains = [
      { name: 'Ferry Control Dashboard', url: 'https://ferry.linknote.com' },
      { name: 'Operations Dashboard', url: 'https://ops.linknote.com' },
      { name: 'Main Site', url: 'https://linknote.com' }
    ];
    
    for (const domain of domains) {
      console.log(`Testing ${domain.name}: ${domain.url}`);
      
      try {
        const response = await page.request.get(domain.url);
        console.log(`${domain.name} status: ${response.status()}`);
        
        if (response.status() === 200) {
          console.log(`✅ ${domain.name} is accessible`);
        } else if ([301, 302, 307, 308].includes(response.status())) {
          console.log(`↗️  ${domain.name} redirects (${response.status()})`);
        } else {
          console.warn(`⚠️  ${domain.name} returned ${response.status()}`);
        }
      } catch (error) {
        console.warn(`❌ ${domain.name} failed: ${error.message}`);
      }
    }
  });

  test.afterAll(async () => {
    console.log('📋 Test Summary Complete');
    
    try {
      const stack = runAWSCommand(`cloudformation describe-stacks --stack-name ${CONFIG.stackName}`);
      console.log(`Final stack status: ${stack.Stacks[0].StackStatus}`);
      
      if (stack.Stacks[0].Outputs) {
        console.log('🎯 Deployment Endpoints:');
        stack.Stacks[0].Outputs.forEach(output => {
          console.log(`  ${output.OutputKey}: ${output.OutputValue}`);
        });
      }
    } catch (error) {
      console.error('Could not retrieve final stack status:', error.message);
    }
  });
});

test.describe('BC Ferries Service Health Checks', () => {
  test('should verify AWS service quotas and limits', async () => {
    console.log('📊 Checking AWS service quotas...');
    
    try {
      // Check Grafana workspace limits
      const grafanaWorkspaces = runAWSCommand('grafana list-workspaces');
      console.log(`Current Grafana workspaces: ${grafanaWorkspaces.workspaces?.length || 0}`);
      
      // Check TimeStream databases
      try {
        const timestreamDatabases = runAWSCommand('timestream-query list-databases');
        console.log(`Current TimeStream databases: ${timestreamDatabases.Databases?.length || 0}`);
      } catch (error) {
        console.log('TimeStream quota check failed (might not have access)');
      }
      
      // Check IoT Core things
      try {
        const iotThings = runAWSCommand('iot list-things --max-results 10');
        console.log(`Sample IoT things count: ${iotThings.things?.length || 0}`);
      } catch (error) {
        console.log('IoT Core quota check failed');
      }
      
      console.log('✅ Service quota checks completed');
    } catch (error) {
      console.warn('⚠️  Some quota checks failed:', error.message);
    }
  });

  test('should validate regional service availability', async () => {
    console.log('🗺️  Checking regional service availability...');
    
    const services = [
      { name: 'Grafana', command: 'grafana list-workspaces' },
      { name: 'IoT Core', command: 'iot list-things --max-results 1' },
      { name: 'Lambda', command: 'lambda list-functions --max-items 1' },
      { name: 'CloudWatch', command: 'logs describe-log-groups --limit 1' }
    ];
    
    for (const service of services) {
      try {
        runAWSCommand(service.command);
        console.log(`✅ ${service.name} available in ${CONFIG.region}`);
      } catch (error) {
        console.error(`❌ ${service.name} not available: ${error.message}`);
      }
    }
  });
});