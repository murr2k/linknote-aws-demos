# CloudFlare DNS Configuration for ferry.linknote.com

## Current Status
✅ **Target Server**: bc-ferries-control-new.fly.dev is healthy (200 OK)  
❌ **DNS**: ferry.linknote.com is not configured yet  
🎯 **Target IP**: 66.241.125.19

## Configuration Methods

### Method 1: Automated Script (Recommended)
Run the configuration script with your CloudFlare credentials:

```bash
# Export your CloudFlare credentials
export CLOUDFLARE_EMAIL="your-email@domain.com"
export CLOUDFLARE_API_KEY="your-global-api-key"  
export CLOUDFLARE_ZONE_ID="your-zone-id"

# Run the configuration
./run-dns-config.sh
```

### Method 2: GitHub Actions Workflow
The workflow is available but needs to be triggered manually:

```bash
gh workflow run configure-dns.yml
```

### Method 3: Manual CloudFlare Dashboard
1. Go to [CloudFlare Dashboard](https://dash.cloudflare.com)
2. Select your domain zone
3. Go to DNS → Records
4. Add/Edit A record:
   - **Type**: A
   - **Name**: ferry
   - **Content**: 66.241.125.19
   - **Proxy status**: On (orange cloud)
   - **TTL**: Auto

### Method 4: CloudFlare API (Direct)
```bash
curl -X POST "https://api.cloudflare.com/client/v4/zones/YOUR_ZONE_ID/dns_records" \
  -H "X-Auth-Email: your-email@domain.com" \
  -H "X-Auth-Key: your-api-key" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "ferry",
    "content": "66.241.125.19",
    "ttl": 300,
    "proxied": true
  }'
```

## Getting CloudFlare Credentials

### Required Information:
1. **Email**: Your CloudFlare account email
2. **Global API Key**: From [API Tokens page](https://dash.cloudflare.com/profile/api-tokens)
3. **Zone ID**: From your domain's overview page

### Finding Your Zone ID:
1. Log in to CloudFlare Dashboard
2. Select your domain (linknote.com)
3. Zone ID is displayed in the right sidebar under "API"

## Verification Commands

### Check DNS Configuration:
```bash
# Verify DNS resolution
./verify-dns.sh

# Quick check
dig ferry.linknote.com
nslookup ferry.linknote.com

# Test connectivity  
curl -I https://ferry.linknote.com/health
```

### Expected Results After Configuration:
- DNS resolves to: `66.241.125.19`
- HTTPS works: `https://ferry.linknote.com/health` returns 200
- Dashboard accessible: `https://ferry.linknote.com`

## Troubleshooting

### DNS Not Resolving:
- Wait 1-5 minutes for propagation
- Clear DNS cache: `sudo systemctl flush-dns` (Linux)
- Use different DNS server: `dig @8.8.8.8 ferry.linknote.com`

### HTTPS Not Working:
- Check if DNS propagated globally: [whatsmydns.net](https://www.whatsmydns.net/#A/ferry.linknote.com)
- Verify CloudFlare proxy is enabled (orange cloud)
- Check SSL/TLS encryption mode is "Flexible" or "Full"

### Target Server Issues:
```bash
# Check target health
curl -I https://bc-ferries-control-new.fly.dev/health

# Should return: 200 OK
```

## Files Created:
- `scripts/configure-dns.sh` - Original automated script
- `scripts/configure-dns-manual.sh` - Manual execution script  
- `run-dns-config.sh` - Multi-method configuration runner
- `configure-dns-now.sh` - Immediate configuration with status
- `verify-dns.sh` - Comprehensive DNS verification
- `.github/workflows/configure-dns.yml` - GitHub Actions workflow

## Next Steps:
1. Choose a configuration method above
2. Provide CloudFlare credentials
3. Run the configuration
4. Wait 1-5 minutes for DNS propagation
5. Verify with `./verify-dns.sh`
6. Access dashboard at `https://ferry.linknote.com`

---

**Note**: All scripts are ready to use. The main requirement is providing valid CloudFlare credentials to execute the DNS record creation/update.