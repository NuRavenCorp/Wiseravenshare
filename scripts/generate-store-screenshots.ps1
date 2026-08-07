param(
    [string]$OutputRoot = "e:\NuRavenCorp\Wiseravenshare\Wiseravenshare\wiseravenshare.client\release-artifacts\store-screenshots",
    [switch]$AlternateStyle
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function Get-Gcd {
    param(
        [int]$A,
        [int]$B
    )

    $x = [Math]::Abs($A)
    $y = [Math]::Abs($B)
    while ($y -ne 0) {
        $t = $y
        $y = $x % $y
        $x = $t
    }
    return [Math]::Max(1, $x)
}

function New-Screenshot {
    param(
        [string]$Path,
        [int]$Width,
        [int]$Height,
        [string]$Title,
        [string]$Subtitle,
        [int]$Variant
    )

    $bmp = New-Object System.Drawing.Bitmap $Width, $Height
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    try {
        $rect = [System.Drawing.Rectangle]::new(0, 0, $Width, $Height)

        $palette = if ($AlternateStyle) {
            @(
                @([System.Drawing.Color]::FromArgb(35, 14, 18), [System.Drawing.Color]::FromArgb(255, 115, 64)),
                @([System.Drawing.Color]::FromArgb(23, 34, 30), [System.Drawing.Color]::FromArgb(252, 191, 73)),
                @([System.Drawing.Color]::FromArgb(27, 20, 42), [System.Drawing.Color]::FromArgb(255, 99, 132))
            )
        }
        else {
            @(
                @([System.Drawing.Color]::FromArgb(18, 11, 41), [System.Drawing.Color]::FromArgb(70, 191, 255)),
                @([System.Drawing.Color]::FromArgb(15, 30, 55), [System.Drawing.Color]::FromArgb(0, 173, 181)),
                @([System.Drawing.Color]::FromArgb(29, 16, 58), [System.Drawing.Color]::FromArgb(110, 75, 215))
            )
        }

        $colors = $palette[$Variant % $palette.Count]
        $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, $colors[0], $colors[1], 35)
        $g.FillRectangle($bg, $rect)

        $overlayBrush = if ($AlternateStyle) {
            New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(52, 255, 245, 220))
        }
        else {
            New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(34, 255, 255, 255))
        }
        $g.FillEllipse($overlayBrush, [int]($Width * 0.62), [int]($Height * -0.1), [int]($Width * 0.52), [int]($Width * 0.52))

        $safePad = [int]([Math]::Max(24, [Math]::Round($Width * 0.055)))
        $titleSize = [Math]::Max(20.0, [Math]::Round($Width / 17.0, 1))
        $subtitleSize = [Math]::Max(12.0, [Math]::Round($Width / 34.0, 1))

        $titleFont = New-Object System.Drawing.Font("Segoe UI", [float]$titleSize, [System.Drawing.FontStyle]::Bold)
        $subtitleFont = New-Object System.Drawing.Font("Segoe UI", [float]$subtitleSize, [System.Drawing.FontStyle]::Regular)

        $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 255, 255, 255))
        $subtitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 230, 240, 255))

        $g.DrawString("WISERAVENSHARE", $titleFont, $titleBrush, $safePad, $safePad)
        $g.DrawString($Title, $subtitleFont, $subtitleBrush, $safePad, $safePad + [int]($titleSize * 1.8))
        $g.DrawString($Subtitle, $subtitleFont, $subtitleBrush, $safePad, $safePad + [int]($titleSize * 3.1))

        # Mock UI shell
        $shellTop = [int]($safePad + $titleSize * 4.6)
        $shellWidth = [int]($Width - ($safePad * 2))
        $shellHeight = [int]($Height - $shellTop - $safePad)
        $shellRect = [System.Drawing.Rectangle]::new($safePad, $shellTop, $shellWidth, $shellHeight)

        $shellBrush = if ($AlternateStyle) {
            New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 24, 22, 30))
        }
        else {
            New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 10, 16, 26))
        }
        $g.FillRectangle($shellBrush, $shellRect)

        $shellBorder = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(120, 255, 255, 255), [float][Math]::Max(2.0, [Math]::Round($Width / 420.0, 2)))
        $g.DrawRectangle($shellBorder, $shellRect)

        $headerHeight = [int]([Math]::Max(26, [Math]::Round($shellHeight * 0.12)))
        $headerRect = [System.Drawing.Rectangle]::new(($safePad + 1), ($shellTop + 1), ($shellWidth - 2), ($headerHeight - 2))
        $headerBrush = if ($AlternateStyle) {
            New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 82, 34, 28))
        }
        else {
            New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(235, 34, 40, 66))
        }
        $g.FillRectangle($headerBrush, $headerRect)

        $chipColor = if ($AlternateStyle) {
            [System.Drawing.Color]::FromArgb(210, 255, 183, 77)
        }
        else {
            [System.Drawing.Color]::FromArgb(210, 82, 214, 255)
        }
        $chipPen = New-Object System.Drawing.Pen($chipColor, [float][Math]::Max(2.0, [Math]::Round($Width / 480.0, 2)))
        $chipRect = [System.Drawing.Rectangle]::new([int]($safePad + $shellWidth * 0.66), [int]($shellTop + $headerHeight * 0.26), [int]($shellWidth * 0.28), [int]($headerHeight * 0.46))
        $g.DrawRectangle($chipPen, $chipRect)

        # Feed cards
        $cardGap = [int]([Math]::Max(10, [Math]::Round($shellHeight * 0.03)))
        $cardAreaTop = $shellTop + $headerHeight + $cardGap
        $usableHeight = $shellHeight - $headerHeight - ($cardGap * 4)
        $cardHeight = [int]($usableHeight / 3)

        for ($i = 0; $i -lt 3; $i++) {
            $y = $cardAreaTop + (($cardHeight + $cardGap) * $i)
            $cardRect = [System.Drawing.Rectangle]::new([int]($safePad + $cardGap), $y, [int]($shellWidth - ($cardGap * 2)), $cardHeight)
            $alpha = 165 + ($i * 18)
            $cardBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($alpha, 28, 39, 58))
            $g.FillRectangle($cardBrush, $cardRect)

            $lineBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(205, 218, 230, 240))
            $line1 = [System.Drawing.Rectangle]::new([int]($cardRect.X + $cardGap), [int]($cardRect.Y + $cardGap), [int]($cardRect.Width * 0.70), [int]([Math]::Max(5, [Math]::Round($cardHeight * 0.10))))
            $line2 = [System.Drawing.Rectangle]::new([int]($cardRect.X + $cardGap), [int]($cardRect.Y + $cardGap * 2.4), [int]($cardRect.Width * 0.56), [int]([Math]::Max(4, [Math]::Round($cardHeight * 0.08))))
            $line3 = [System.Drawing.Rectangle]::new([int]($cardRect.X + $cardGap), [int]($cardRect.Y + $cardGap * 3.6), [int]($cardRect.Width * 0.40), [int]([Math]::Max(4, [Math]::Round($cardHeight * 0.08))))
            $g.FillRectangle($lineBrush, $line1)
            $g.FillRectangle($lineBrush, $line2)
            $g.FillRectangle($lineBrush, $line3)

            $thumbRect = [System.Drawing.Rectangle]::new([int]($cardRect.Right - ($cardRect.Width * 0.22) - $cardGap), [int]($cardRect.Y + $cardGap), [int]($cardRect.Width * 0.22), [int]($cardRect.Height - $cardGap * 2))
            $thumbBrush = if ($AlternateStyle) {
                New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 255, 144, 92))
            }
            else {
                New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(190, 62, 191, 255))
            }
            $g.FillRectangle($thumbBrush, $thumbRect)

            $cardBrush.Dispose()
            $lineBrush.Dispose()
            $thumbBrush.Dispose()
        }

        $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)

        $bg.Dispose()
        $overlayBrush.Dispose()
        $titleFont.Dispose()
        $subtitleFont.Dispose()
        $titleBrush.Dispose()
        $subtitleBrush.Dispose()
        $shellBrush.Dispose()
        $shellBorder.Dispose()
        $headerBrush.Dispose()
        $chipPen.Dispose()
    }
    finally {
        $g.Dispose()
        $bmp.Dispose()
    }
}

if (-not (Test-Path $OutputRoot)) {
    New-Item -ItemType Directory -Path $OutputRoot -Force | Out-Null
}

$specs = @(
    # Phone (320-3840, 9:16)
    @{ Name = "phone-01.png"; Width = 1080; Height = 1920; Title = "Discover truth signals fast"; Subtitle = "Realtime feed intelligence on mobile"; Variant = 0 },
    @{ Name = "phone-02.png"; Width = 1080; Height = 1920; Title = "Plan, post, and grow"; Subtitle = "Creator workflow with one-tap actions"; Variant = 1 },
    @{ Name = "phone-03.png"; Width = 1080; Height = 1920; Title = "Ravensight video insights"; Subtitle = "Understand what performs and why"; Variant = 2 },

    # 7" tablet (320-3840, 9:16)
    @{ Name = "tablet7-01.png"; Width = 1440; Height = 2560; Title = "Bigger view for daily strategy"; Subtitle = "Track trends and engagement together"; Variant = 0 },
    @{ Name = "tablet7-02.png"; Width = 1440; Height = 2560; Title = "Faster newsroom triage"; Subtitle = "Sort critical stories with confidence"; Variant = 1 },
    @{ Name = "tablet7-03.png"; Width = 1440; Height = 2560; Title = "Deep social graph context"; Subtitle = "Map influence in seconds"; Variant = 2 },

    # 10" tablet (1080-7680, 9:16)
    @{ Name = "tablet10-01.png"; Width = 2160; Height = 3840; Title = "Executive command dashboard"; Subtitle = "Monitor growth and risk side by side"; Variant = 0 },
    @{ Name = "tablet10-02.png"; Width = 2160; Height = 3840; Title = "Campaign planning at scale"; Subtitle = "Coordinate teams with shared insights"; Variant = 1 },
    @{ Name = "tablet10-03.png"; Width = 2160; Height = 3840; Title = "Cross-platform performance intelligence"; Subtitle = "Unify what matters across channels"; Variant = 2 },

    # Chromebook (1080-7680, 16:9)
    @{ Name = "chromebook-01.png"; Width = 3840; Height = 2160; Title = "Desktop-grade clarity"; Subtitle = "Wide analytics for newsroom decisions"; Variant = 0 },
    @{ Name = "chromebook-02.png"; Width = 3840; Height = 2160; Title = "Collaborative workflow"; Subtitle = "Teams align on one source of truth"; Variant = 1 },
    @{ Name = "chromebook-03.png"; Width = 3840; Height = 2160; Title = "Live monitor mode"; Subtitle = "Stay ahead of narrative shifts"; Variant = 2 },

    # Android XR (720-7680, 9:16)
    @{ Name = "androidxr-01.png"; Width = 1440; Height = 2560; Title = "Immersive signal layers"; Subtitle = "See context beyond the headline"; Variant = 0 },
    @{ Name = "androidxr-02.png"; Width = 1440; Height = 2560; Title = "Spatial content timelines"; Subtitle = "Navigate events naturally"; Variant = 1 },
    @{ Name = "androidxr-03.png"; Width = 1440; Height = 2560; Title = "XR-ready intelligence"; Subtitle = "Future-proof discovery workflows"; Variant = 2 }
)

$results = @()
foreach ($spec in $specs) {
    $path = Join-Path $OutputRoot $spec.Name
    New-Screenshot -Path $path -Width $spec.Width -Height $spec.Height -Title $spec.Title -Subtitle $spec.Subtitle -Variant $spec.Variant

    $gcd = Get-Gcd -A $spec.Width -B $spec.Height

    $results += [pscustomobject]@{
        File = $spec.Name
        Width = $spec.Width
        Height = $spec.Height
        Aspect = "{0}:{1}" -f ($spec.Width / $gcd), ($spec.Height / $gcd)
        Path = $path
    }
}

$results | Format-Table -AutoSize
