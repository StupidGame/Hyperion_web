$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function New-RoundedRectanglePath {
  param(
    [System.Drawing.RectangleF] $Bounds,
    [float] $Radius
  )

  $diameter = $Radius * 2
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $path.AddArc($Bounds.X, $Bounds.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Bounds.X, $Bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-HyperionIcon {
  param(
    [int] $Size,
    [string] $OutputPath,
    [bool] $Maskable = $false
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::FromArgb(16, 17, 20))

  try {
    $backgroundPath = New-RoundedRectanglePath -Bounds ([System.Drawing.RectangleF]::new(0, 0, $Size, $Size)) -Radius ($Size * 0.22)
    $backgroundBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      [System.Drawing.RectangleF]::new(0, 0, $Size, $Size),
      [System.Drawing.Color]::FromArgb(16, 17, 20),
      [System.Drawing.Color]::FromArgb(30, 36, 32),
      45
    )
    $graphics.FillPath($backgroundBrush, $backgroundPath)

    $padding = if ($Maskable) { $Size * 0.18 } else { $Size * 0.14 }
    $markBounds = [System.Drawing.RectangleF]::new($padding, $padding, $Size - ($padding * 2), $Size - ($padding * 2))
    $markPath = New-RoundedRectanglePath -Bounds $markBounds -Radius ($Size * 0.11)
    $markBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
      $markBounds,
      [System.Drawing.Color]::FromArgb(184, 255, 68),
      [System.Drawing.Color]::FromArgb(117, 215, 255),
      135
    )
    $graphics.FillPath($markBrush, $markPath)

    $cornerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(70, 16, 17, 20))
    $cornerSize = $Size * 0.13
    $corner = [System.Drawing.PointF[]] @(
      [System.Drawing.PointF]::new($markBounds.Right - $cornerSize, $markBounds.Top + ($Size * 0.035)),
      [System.Drawing.PointF]::new($markBounds.Right - ($Size * 0.035), $markBounds.Top + ($Size * 0.035)),
      [System.Drawing.PointF]::new($markBounds.Right - ($Size * 0.035), $markBounds.Top + $cornerSize)
    )
    $graphics.FillPolygon($cornerBrush, $corner)

    $stroke = [Math]::Max(10, $Size * 0.09)
    $rssPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(16, 17, 20), $stroke)
    $rssPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $rssPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $rssBoundsLarge = [System.Drawing.RectangleF]::new($Size * 0.29, $Size * 0.34, $Size * 0.41, $Size * 0.41)
    $rssBoundsSmall = [System.Drawing.RectangleF]::new($Size * 0.29, $Size * 0.51, $Size * 0.23, $Size * 0.23)
    $graphics.DrawArc($rssPen, $rssBoundsLarge, 270, 90)
    $graphics.DrawArc($rssPen, $rssBoundsSmall, 270, 90)
    $graphics.FillEllipse(
      [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(16, 17, 20)),
      [System.Drawing.RectangleF]::new($Size * 0.29, $Size * 0.68, $stroke, $stroke)
    )
  } finally {
    $graphics.Dispose()
  }

  $directory = Split-Path -Parent $OutputPath
  if (!(Test-Path $directory)) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
  }

  $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
}

$icons = Join-Path $PSScriptRoot '..\public\icons'
New-HyperionIcon -Size 192 -OutputPath (Join-Path $icons 'icon-192.png')
New-HyperionIcon -Size 512 -OutputPath (Join-Path $icons 'icon-512.png')
New-HyperionIcon -Size 192 -OutputPath (Join-Path $icons 'maskable-192.png') -Maskable $true
New-HyperionIcon -Size 512 -OutputPath (Join-Path $icons 'maskable-512.png') -Maskable $true
New-HyperionIcon -Size 180 -OutputPath (Join-Path $icons 'apple-touch-icon.png')
