# Test deployment: barcode + RPC count_orange/rouge
$ProjectId = "rogesnduejmqpxolhbif"
$FunctionUrl = "https://rogesnduejmqpxolhbif.supabase.co/functions/v1"
$AnonKey = $env:EXPO_PUBLIC_SUPABASE_ANON_KEY
$SupabaseUrl = "https://rogesnduejmqpxolhbif.supabase.co"

Write-Host "=== DEPLOYMENT TEST ===" -ForegroundColor Cyan

# Test 1: Barcode scan
Write-Host "`n[1] Testing barcode scan function..."
try {
  $barcodeResp = Invoke-WebRequest -Uri "$FunctionUrl/product-by-barcode" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $AnonKey" } `
    -Body (@{barcode = "5000308051097"} | ConvertTo-Json) `
    -ErrorAction Stop
  Write-Host "✓ Barcode function deployed (HTTP $($barcodeResp.StatusCode))" -ForegroundColor Green
} catch {
  Write-Host "✗ Barcode function FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 2: RPC search_catalog
Write-Host "`n[2] Testing RPC search_catalog with count_orange/rouge..."
try {
  $searchResp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/rpc/cosme_check_search_catalog" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $AnonKey"; "apikey" = $AnonKey } `
    -Body (@{ p_query = "shampoo"; p_limit = 1 } | ConvertTo-Json) `
    -ErrorAction Stop
  $results = $searchResp.Content | ConvertFrom-Json
  if ($results.Count -gt 0) {
    $first = $results[0]
    if ($null -ne $first.count_orange -and $null -ne $first.count_rouge) {
      Write-Host "✓ search_catalog returns count_orange/rouge" -ForegroundColor Green
      Write-Host "  count_orange: $($first.count_orange), count_rouge: $($first.count_rouge)" -ForegroundColor Gray
    } else {
      Write-Host "⚠ Missing count columns" -ForegroundColor Yellow
    }
  }
} catch {
  Write-Host "✗ search_catalog FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: RPC browse_subcategory
Write-Host "`n[3] Testing RPC browse_subcategory with count_orange/rouge..."
try {
  $browseResp = Invoke-WebRequest -Uri "$SupabaseUrl/rest/v1/rpc/cosme_check_browse_subcategory" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $AnonKey"; "apikey" = $AnonKey } `
    -Body (@{ p_category = "coiffure"; p_limit = 1 } | ConvertTo-Json) `
    -ErrorAction Stop
  $results = $browseResp.Content | ConvertFrom-Json
  if ($results.Count -gt 0) {
    $first = $results[0]
    if ($null -ne $first.count_orange -and $null -ne $first.count_rouge) {
      Write-Host "✓ browse_subcategory returns count_orange/rouge" -ForegroundColor Green
      Write-Host "  count_orange: $($first.count_orange), count_rouge: $($first.count_rouge)" -ForegroundColor Gray
    }
  }
} catch {
  Write-Host "✗ browse_subcategory FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n=== TEST COMPLETE ===" -ForegroundColor Cyan
