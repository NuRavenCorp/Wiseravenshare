param(
    [string]$BaseUrl = "http://localhost:10000",
    [PSCredential]$ValidCredential = $null,
    [int]$TimeoutSec = 20
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Invoke-JsonPost {
    param(
        [string]$Url,
        [hashtable]$Body
    )

    $json = $Body | ConvertTo-Json -Depth 5

    try {
        $response = Invoke-WebRequest -Uri $Url -Method Post -ContentType "application/json" -Body $json -TimeoutSec $TimeoutSec
        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body = $response.Content
            Error = $null
        }
    }
    catch {
        $ex = $_.Exception
        $statusCode = $null
        $responseBody = ""

        if ($ex.PSObject.Properties.Name -contains "Response" -and $null -ne $ex.Response) {
            try { $statusCode = [int]$ex.Response.StatusCode } catch {}
            try { $responseBody = $ex.Response.Content } catch {}
        }

        return [pscustomobject]@{
            StatusCode = $statusCode
            Body = $responseBody
            Error = $ex.Message
        }
    }
}

$results = @()

function Add-Result {
    param(
        [string]$Check,
        [string]$Status,
        [string]$Details
    )

    $script:results += [pscustomobject]@{
        Check = $Check
        Status = $Status
        Details = $Details
    }
}

$loginUrl = "$BaseUrl/api/auth/login"
$registerUrl = "$BaseUrl/api/auth/register"

# 1) Gibberish login should fail.
$badLogin = Invoke-JsonPost -Url $loginUrl -Body @{ email = "a"; password = "1" }
if ($badLogin.StatusCode -eq 401 -or $badLogin.StatusCode -eq 400) {
    Add-Result -Check "gibberish_login_blocked" -Status "ok" -Details "Status $($badLogin.StatusCode)"
}
else {
    Add-Result -Check "gibberish_login_blocked" -Status "fail" -Details "Expected 400/401, got $($badLogin.StatusCode). $($badLogin.Body)"
}

# 2) Registration should be blocked by default.
$badRegister = Invoke-JsonPost -Url $registerUrl -Body @{ name = "x"; email = "x@x.com"; password = "StrongPass123!" }
if ($badRegister.StatusCode -eq 403) {
    Add-Result -Check "self_registration_blocked" -Status "ok" -Details "Status 403"
}
else {
    Add-Result -Check "self_registration_blocked" -Status "fail" -Details "Expected 403, got $($badRegister.StatusCode). $($badRegister.Body)"
}

# 3) Optional allowlisted login check.
if ($null -ne $ValidCredential) {
    $plainPassword = [System.Net.NetworkCredential]::new("", $ValidCredential.Password).Password
    $validLogin = Invoke-JsonPost -Url $loginUrl -Body @{ email = $ValidCredential.UserName; password = $plainPassword }
    if ($validLogin.StatusCode -eq 200) {
        Add-Result -Check "allowlisted_login_succeeds" -Status "ok" -Details "Status 200"
    }
    else {
        Add-Result -Check "allowlisted_login_succeeds" -Status "fail" -Details "Expected 200, got $($validLogin.StatusCode). $($validLogin.Body)"
    }
}

Write-Host "Auth regression report for $BaseUrl"
$results | Format-Table -AutoSize

$failCount = ($results | Where-Object { $_.Status -eq "fail" }).Count
if ($failCount -gt 0) {
    Write-Host "Summary: fail=$failCount"
    exit 2
}

Write-Host "Summary: fail=0"
exit 0
