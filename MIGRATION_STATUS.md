# AWS Subdomain Migration Status: aws.linknote.com → aws.linknode.com

## ✅ Completed Steps

### 1. Infrastructure Updates
- ✅ Updated CloudFormation template (`config/linknote-infrastructure.yaml`)
  - Added `AWSSubdomainName` parameter
  - Added `aws.linknode.com` to certificate SubjectAlternativeNames
  - Added `aws.linknode.com` to CloudFront aliases
  - Added output for new subdomain URL

### 2. Certificate Requested
- ✅ **New Certificate ARN**: `arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447`
- ✅ **Domains included**:
  - linknote.com
  - www.linknote.com
  - aws.linknode.com *(new)*
- ✅ **Validation records generated** (see CERTIFICATE_VALIDATION_RECORDS.md)

### 3. CloudFront Distribution Identified
- ✅ **Distribution ID**: E2YEJACEYDBDX3
- ✅ **Current Domain**: d288vhnilf4g47.cloudfront.net
- ✅ **Current Aliases**: linknote.com, www.linknote.com
- ✅ **Current Certificate**: arn:aws:acm:us-east-1:553386187835:certificate/0d54d5ea-4c84-47bf-9b17-8785f58593ea

### 4. Documentation Created
- ✅ `docs/aws-subdomain-migration.md` - Comprehensive migration guide
- ✅ `CERTIFICATE_VALIDATION_RECORDS.md` - DNS validation instructions
- ✅ `MIGRATION_STATUS.md` - This status document

### 5. Automation Scripts Created
- ✅ `scripts/update-aws-subdomain.sh` - CloudFormation stack update script
- ✅ `scripts/configure-aws-linknode-dns.sh` - DNS configuration script
- ✅ `scripts/complete-aws-linknode-migration.sh` - Migration completion script

## ⏳ Pending Steps (Manual Intervention Required)

### Step 1: Add DNS Validation Records *(REQUIRED NEXT)*

**Action Required**: Add the following DNS records in CloudFlare

#### For linknote.com zone:
```
1. Type: CNAME
   Name: _bbe18a203b3282a1956c55fd947abbe7.linknote.com
   Target: _b9d6a38433496974b0d4f2176eaeb55b.xlfgrmvvlj.acm-validations.aws.
   Proxy: OFF

2. Type: CNAME
   Name: _370ab8da13d6d0915b3eb8a6fc6f5940.www.linknote.com
   Target: _24589eae30bc9190a9251bce165d7c7c.xlfgrmvvlj.acm-validations.aws.
   Proxy: OFF
```

#### For linknode.com zone:
```
Type: CNAME
Name: _89c4c459bfdf1fc8098613f98d1695e8.aws.linknode.com
Target: _d5f1481d54f1ef6e4a9734ead0b1217f.xlfgrmvvlj.acm-validations.aws.
Proxy: OFF
```

**Where to add**: CloudFlare Dashboard → Select Zone → DNS → Add record

**Time required**: 5-10 minutes to add records

---

### Step 2: Wait for Certificate Validation

**Action Required**: Monitor validation status

```bash
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447 \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[*].[DomainName, ValidationStatus]' \
  --output table
```

**Expected**: All domains should show `SUCCESS` status

**Time required**: 5-30 minutes after DNS records are added

---

### Step 3: Update CloudFront Distribution

**Action Required**: Run the migration completion script

```bash
./scripts/complete-aws-linknode-migration.sh
```

**What it does**:
- Verifies certificate is validated
- Updates CloudFront distribution with new domain alias
- Updates distribution to use new certificate
- Monitors deployment status

**Time required**: 15-20 minutes for CloudFront propagation

---

### Step 4: Add DNS CNAME for aws.linknode.com

**Action Required**: Add final DNS record in CloudFlare (linknode.com zone)

```
Type: CNAME
Name: aws.linknode.com
Target: d288vhnilf4g47.cloudfront.net
TTL: 300
Proxy: ON (optional, for CloudFlare CDN)
```

**Time required**: 5-10 minutes for DNS propagation

---

### Step 5: Test and Verify

**Action Required**: Test the new domain

```bash
# Test DNS resolution
dig aws.linknode.com +short

# Test HTTPS
curl -I https://aws.linknode.com

# Verify SSL certificate
curl -vI https://aws.linknode.com 2>&1 | grep -A 5 'subject:'
```

**Expected**: Site loads successfully with valid SSL certificate

---

## Why Manual Intervention Is Needed

**CloudFlare API Issue**: The CloudFlare API credentials in the environment appear to be incomplete or expired:
```bash
CLOUDFLARE_EMAIL=murr2k@gmail.com
CLOUDFLARE_API_KEY=f97073b77e87cd84a6f231be9d2a7e83a5bf4  # Appears truncated
```

**Resolution Options**:
1. **Use CloudFlare Dashboard** (recommended) - Add records manually via web UI
2. **Update API credentials** - Get a new API token from CloudFlare:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Create token with "Edit DNS" permissions
   - Export as `CLOUDFLARE_API_TOKEN`

## Quick Start (What to Do Next)

```bash
# 1. Add DNS validation records in CloudFlare dashboard
#    (See CERTIFICATE_VALIDATION_RECORDS.md for exact values)

# 2. Wait for validation (check every few minutes)
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447 \
  --region us-east-1 \
  --query 'Certificate.Status' \
  --output text

# 3. Once it shows "ISSUED", run:
./scripts/complete-aws-linknode-migration.sh

# 4. Add DNS CNAME for aws.linknode.com in CloudFlare

# 5. Test
curl -I https://aws.linknode.com
```

## Timeline Estimate

| Step | Duration | Status |
|------|----------|--------|
| Add DNS records | 5-10 min | ⏳ Pending |
| Certificate validation | 5-30 min | ⏳ Pending |
| CloudFront update | 15-20 min | ⏳ Pending |
| DNS propagation | 5-10 min | ⏳ Pending |
| **Total** | **30-70 min** | ⏳ Waiting for DNS records |

## Current Blockers

1. **CloudFlare DNS Records** - Need to add certificate validation records manually
2. **CloudFlare API Access** - API credentials need to be updated for automation

## Files Reference

| File | Purpose |
|------|---------|
| `CERTIFICATE_VALIDATION_RECORDS.md` | DNS validation records to add |
| `MIGRATION_STATUS.md` | This file - current status |
| `docs/aws-subdomain-migration.md` | Complete migration guide |
| `scripts/complete-aws-linknode-migration.sh` | Run after certificate validates |
| `config/linknote-infrastructure.yaml` | Updated CloudFormation template |

## Contact / Support

If you encounter issues:
1. Check certificate validation status in AWS ACM console
2. Verify DNS records in CloudFlare dashboard
3. Review CloudFront distribution status in AWS console
4. Check logs in `/tmp/cf-config*.json` (if script was run)
