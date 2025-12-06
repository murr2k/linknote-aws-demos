# Certificate Validation Records - aws.linknode.com Migration

## Certificate Information
- **New Certificate ARN**: `arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447`
- **Domains Covered**:
  - linknote.com
  - www.linknote.com
  - aws.linknode.com *(new)*

## DNS Validation Records Required

### 1. linknote.com Zone
Add these CNAME records to the **linknote.com** CloudFlare zone:

#### Validation for linknote.com
```
Type: CNAME
Name: _bbe18a203b3282a1956c55fd947abbe7.linknote.com
Target: _b9d6a38433496974b0d4f2176eaeb55b.xlfgrmvvlj.acm-validations.aws.
TTL: Auto (or 300)
Proxy: OFF (IMPORTANT!)
```

#### Validation for www.linknote.com
```
Type: CNAME
Name: _370ab8da13d6d0915b3eb8a6fc6f5940.www.linknote.com
Target: _24589eae30bc9190a9251bce165d7c7c.xlfgrmvvlj.acm-validations.aws.
TTL: Auto (or 300)
Proxy: OFF (IMPORTANT!)
```

### 2. linknode.com Zone
Add this CNAME record to the **linknode.com** CloudFlare zone:

#### Validation for aws.linknode.com
```
Type: CNAME
Name: _89c4c459bfdf1fc8098613f98d1695e8.aws.linknode.com
Target: _d5f1481d54f1ef6e4a9734ead0b1217f.xlfgrmvvlj.acm-validations.aws.
TTL: Auto (or 300)
Proxy: OFF (IMPORTANT!)
```

## CloudFlare UI Instructions

### Adding Records via CloudFlare Dashboard

1. **Log in to CloudFlare**: https://dash.cloudflare.com/
2. **Select the zone** (linknote.com or linknode.com)
3. Click **DNS** in the left sidebar
4. Click **Add record**
5. Enter the details from above
6. **CRITICAL**: Set Proxy status to "DNS only" (grey cloud icon)
7. Click **Save**

### Adding Records via CloudFlare API

If you have a valid API token:

```bash
export CLOUDFLARE_API_TOKEN="your-token"
export LINKNOTE_ZONE_ID="your-linknote-zone-id"
export LINKNODE_ZONE_ID="your-linknode-zone-id"

# Add validation records for linknote.com
curl -X POST "https://api.cloudflare.com/client/v4/zones/$LINKNOTE_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "_bbe18a203b3282a1956c55fd947abbe7.linknote.com",
    "content": "_b9d6a38433496974b0d4f2176eaeb55b.xlfgrmvvlj.acm-validations.aws.",
    "ttl": 300,
    "proxied": false,
    "comment": "ACM validation for linknote.com"
  }'

curl -X POST "https://api.cloudflare.com/client/v4/zones/$LINKNOTE_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "_370ab8da13d6d0915b3eb8a6fc6f5940.www.linknote.com",
    "content": "_24589eae30bc9190a9251bce165d7c7c.xlfgrmvvlj.acm-validations.aws.",
    "ttl": 300,
    "proxied": false,
    "comment": "ACM validation for www.linknote.com"
  }'

# Add validation record for linknode.com
curl -X POST "https://api.cloudflare.com/client/v4/zones/$LINKNODE_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "CNAME",
    "name": "_89c4c459bfdf1fc8098613f98d1695e8.aws.linknode.com",
    "content": "_d5f1481d54f1ef6e4a9734ead0b1217f.xlfgrmvvlj.acm-validations.aws.",
    "ttl": 300,
    "proxied": false,
    "comment": "ACM validation for aws.linknode.com"
  }'
```

## Monitoring Certificate Validation

After adding the DNS records, monitor the validation status:

```bash
# Check validation status
aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447 \
  --region us-east-1 \
  --query 'Certificate.DomainValidationOptions[*].[DomainName, ValidationStatus]' \
  --output table

# Watch for all domains to show "SUCCESS"
watch -n 30 'aws acm describe-certificate \
  --certificate-arn arn:aws:acm:us-east-1:553386187835:certificate/482923dd-1c60-4e48-8a62-f0a150f57447 \
  --region us-east-1 \
  --query "Certificate.DomainValidationOptions[*].[DomainName, ValidationStatus]" \
  --output table'
```

## Next Steps (After Validation Completes)

Once all three domains show `SUCCESS` validation status:

1. **Update CloudFront Distribution**:
   ```bash
   # Use the script provided
   ./scripts/complete-aws-linknode-migration.sh
   ```

2. **Add DNS CNAME for aws.linknode.com**:
   ```
   Type: CNAME
   Name: aws.linknode.com
   Target: d288vhnilf4g47.cloudfront.net
   TTL: 300
   Proxy: ON (optional, for CloudFlare CDN)
   ```

3. **Test the new domain**:
   ```bash
   curl -I https://aws.linknode.com
   ```

## Timeline

- **DNS Propagation**: 5-15 minutes
- **Certificate Validation**: 5-30 minutes
- **CloudFront Update**: 15-20 minutes
- **Total**: 30-60 minutes

## Troubleshooting

### Validation Not Completing
- Verify the CNAME records are added correctly (no typos)
- Ensure Proxy is OFF (DNS only) for validation records
- Check DNS propagation: `dig _89c4c459bfdf1fc8098613f98d1695e8.aws.linknode.com CNAME +short`
- Wait up to 30 minutes for validation

### CloudFlare API Issues
- Verify API token has DNS edit permissions
- Check zone IDs are correct
- Use CloudFlare dashboard as fallback
