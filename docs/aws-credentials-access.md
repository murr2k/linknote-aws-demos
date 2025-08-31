# AWS Credentials Access Guide

## 🔑 How to Access AWS Credentials for Local Development

### **Method 1: Restore from Backup (Primary Method)**

The AWS credentials are stored in a backup file that can be restored:

```bash
# 1. Check if backup exists
ls -la ~/.aws/credentials.backup

# 2. Restore credentials from backup
cp ~/.aws/credentials.backup ~/.aws/credentials

# 3. Verify access
aws sts get-caller-identity
```

**Location**: `/home/murr2k/.aws/credentials.backup`

**Account Details**:
- **Account ID**: 553386187835
- **User**: murr2k
- **Default Region**: us-west-2

### **Method 2: GitHub Repository Secrets**

AWS credentials are also stored as GitHub secrets for CI/CD:

```bash
# List available secrets
gh secret list --repo murr2k/linknote-aws-demos | grep AWS

# Available secrets:
# - AWS_ACCESS_KEY_ID
# - AWS_SECRET_ACCESS_KEY  
# - AWS_DEFAULT_REGION
```

**Note**: GitHub CLI doesn't expose secret values directly for security. These are used in GitHub Actions workflows.

### **Method 3: MCP Secrets Manager (If Running)**

When the MCP secrets manager is active:

```bash
# Start secrets manager
/home/murr2k/mcp-secrets-startup.sh

# Get credentials
cd /home/murr2k/mcp-servers
./manage-secrets.sh get aws access_key_id
./manage-secrets.sh get aws secret_access_key
```

**API Endpoint**: http://localhost:3457

## 🛠️ Quick Setup Script

```bash
#!/bin/bash
# Quick AWS credentials setup

# Method 1: Try backup restore
if [ -f ~/.aws/credentials.backup ]; then
    echo "✅ Restoring AWS credentials from backup..."
    cp ~/.aws/credentials.backup ~/.aws/credentials
    
    # Test access
    if aws sts get-caller-identity &>/dev/null; then
        echo "✅ AWS credentials configured successfully"
        echo "   Account: $(aws sts get-caller-identity --query Account --output text)"
        echo "   Region: $(aws configure get region)"
        exit 0
    fi
fi

echo "❌ Backup method failed. Try manual configuration:"
echo "   aws configure"
```

## 🔧 Configuration Files

**AWS Config**: `~/.aws/config`
```ini
[default]
region = us-west-2
output = json
```

**AWS Credentials**: `~/.aws/credentials`
```ini
[default]
aws_access_key_id = AKIAYBWDDDQ57K6TQLNL
aws_secret_access_key = [REDACTED - see backup file]
```

## 🚨 Security Notes

1. **Never commit credentials** to version control
2. **Backup file contains actual keys** - handle securely
3. **Credentials work for all AWS services** in account 553386187835
4. **Region us-west-2** is default but can be overridden per service

## 📋 Troubleshooting

### "No credentials found"
```bash
# Check if backup exists
ls -la ~/.aws/credentials.backup

# Restore if available
cp ~/.aws/credentials.backup ~/.aws/credentials
```

### "Access denied" errors
```bash
# Verify account
aws sts get-caller-identity

# Check permissions for specific service
aws iam get-user
```

### "Region not specified"
```bash
# Set default region
aws configure set region us-west-2
```

## ✅ Verification Commands

```bash
# Test basic access
aws sts get-caller-identity

# Test service access
aws s3 ls
aws ec2 describe-regions

# Test CloudFormation (for dual dashboard deployment)
aws cloudformation list-stacks --region us-west-2
```

---

**Last Updated**: 2025-08-31  
**Account**: 553386187835 (murr2k)  
**Primary Region**: us-west-2